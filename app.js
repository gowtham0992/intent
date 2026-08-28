import { createSingleUseGrant, validateGoal } from "./lib/policy.js";
import { runEvaluations } from "./lib/evaluations.js";
import { createMandate, evaluateOffer, validateMandate } from "./lib/mandate.js";
import { ACTION_TOOL, createCheckoutToolContract, staticToolContracts } from "./lib/webmcp-tool-contracts.js";
import { stageCandidate } from "./lib/staging.js";
import { appendActivity } from "./lib/activity.js";
import { summarizeComparison } from "./lib/comparison.js";
import { CAPABILITY_REASONS, capabilityReasonForExecutionError, createCapabilityLedger, snapshotCapability, transitionCapability } from "./lib/capability-state.js";
import { commerceErrorFromResponse } from "./lib/commerce-error.js";
import { createApprovalHandshake } from "./lib/approval-handshake.js";
import { createToolReadback } from "./lib/tool-readback.js";

const $ = (selector) => document.querySelector(selector);
const LEASE_MS = 60_000;

function configuredOrigin() {
  const value = window.__INTENT_CONFIG__?.commerceOrigin;
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== value) throw new TypeError("Intent commerce origin must be exact.");
  return parsed.origin;
}

const commerceOrigin = configuredOrigin();
const state = { goal:null, mandate:null, mandateVersion:1, offers:[], selected:null, staged:null, activity:[], comparedVersions:new Set(), authority:"absent", capability:createCapabilityLedger(ACTION_TOOL), grant:null, controller:null, timeout:null, countdown:null, pendingApproval:null, busy:false, searchTimers:[] };
const els = {
  hero:$("#hero"), market:$("#market"), authority:$("#authority"), receipt:$("#receipt"), form:$("#goal-form"), goal:$("#goal"), budget:$("#budget"), country:$("#country"), minimumRating:$("#minimum-rating"), minimumReviews:$("#minimum-reviews"), mandateRating:$("#mandate-rating"), mandateReviews:$("#mandate-reviews"),
  grid:$("#offers-grid"), offersStage:$("#offers-stage"), searchProgress:$("#search-progress-text"), dock:$("#selection-dock"), searchButton:$("#goal-form button"), lease:$("#lease-button"), approvalState:$("#approval-state"), leaseCount:$("#lease-count"),
  activityList:$("#activity-list"), receiptActivityList:$("#receipt-activity-list"), approvalLifecycle:$("#approval-lifecycle"), receiptCapabilityReason:$("#receipt-capability-reason"), receiptCapabilityNext:$("#receipt-capability-next"), proof:$("#proof-dialog"), proofList:$("#proof-list"), toast:$("#toast"), toastTitle:$("#toast-title"), toastCopy:$("#toast-copy")
};

function renderActivityList(target,entries) {
  target.replaceChildren(...entries.map((entry)=>{const li=document.createElement("li");li.dataset.actor=entry.actor;const actor=document.createElement("span");actor.className="activity-actor";actor.textContent=entry.actor==="you"?"You":entry.actor==="agent"?"Agent":"Intent";const title=document.createElement("b");title.textContent=entry.title;const detail=document.createElement("small");detail.textContent=entry.detail;li.append(actor,title,detail);if(entry.tool){const provenance=document.createElement("code");provenance.className="activity-tool";provenance.textContent=`via WebMCP · ${entry.tool}`;li.append(provenance);}return li;}));
}

function renderActivity() {
  renderActivityList(els.activityList,state.activity);
  renderActivityList(els.receiptActivityList,state.activity.slice(-4));
}

function addActivity(event) {
  state.activity=appendActivity(state.activity,event);renderActivity();
}

function money(amountMinor, currency) {
  try { return new Intl.NumberFormat(undefined,{style:"currency",currency}).format(amountMinor/100); }
  catch { return `${amountMinor/100} ${currency}`; }
}

function view(name) {
  const mainView=name==="authority"?(state.offers.length?"market":"hero"):name;
  for (const [key,element] of Object.entries({hero:els.hero,market:els.market,receipt:els.receipt})) element.classList.toggle("is-active",key===mainView);
  window.scrollTo({top:0,behavior:"smooth"});
}

function toast(title,copy,danger=false) {
  els.toastTitle.textContent=title; els.toastCopy.textContent=copy; els.toast.classList.toggle("danger",danger); els.toast.classList.add("show");
  setTimeout(()=>els.toast.classList.remove("show"),3800);
}

async function commerce(path,body) {
  const response=await fetch(`${commerceOrigin}${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  let payload; try { payload=await response.json(); } catch { throw new Error("The commerce rail returned unreadable data."); }
  if(!response.ok) throw commerceErrorFromResponse(payload,response.status);
  return payload;
}

function readProposal() { return { goal:validateGoal({query:els.goal.value,budget:Number(els.budget.value),country:els.country.value}), preferences:{minimumRating:Number(els.minimumRating.value),minimumReviews:Number(els.minimumReviews.value)} }; }

function offerSummary(offer) {
  return {productId:offer.productId,variantId:offer.variantId,title:offer.title,seller:offer.seller.name,price:offer.price,rating:offer.rating,features:offer.evidence.features,available:offer.available,decision:evaluateOffer(offer,state.mandate)};
}

function renderOffer(offer,index) {
  const decision=evaluateOffer(offer,state.mandate);
  const button=document.createElement("button"); button.type="button"; button.className=`offer-card ${decision.eligible?"eligible":"blocked"}`; button.dataset.variantId=offer.variantId; button.style.setProperty("--offer-index",String(index)); button.setAttribute("aria-label",`${decision.eligible?"Eligible":"Blocked"}: ${offer.title} from ${offer.seller.name}`);
  const rank=document.createElement("span"); rank.className="offer-rank"; rank.textContent=decision.eligible?(index===0?"Eligible · best match":"Eligible"):"Blocked";
  const image=document.createElement("img"); image.className="offer-image"; image.loading="lazy"; image.referrerPolicy="no-referrer"; image.src=offer.image?.url??"/assets/intent-mark-v2.png"; image.alt=offer.image?.alt??offer.title;
  const body=document.createElement("div"); body.className="offer-body";
  const seller=document.createElement("p"); seller.className="offer-seller"; seller.textContent=offer.seller.name;
  const title=document.createElement("h3"); title.textContent=offer.title;
  const description=document.createElement("p"); description.className="offer-description"; description.textContent=offer.description||"Live product detail from the merchant catalog.";
  const features=document.createElement("ul"); features.className="feature-list";
  for(const item of decision.checks){const li=document.createElement("li");li.classList.toggle("failed",!item.passed);li.textContent=item.message;features.append(li);}
  const bottom=document.createElement("div"); bottom.className="offer-bottom";
  const price=document.createElement("strong"); price.textContent=money(offer.price.amountMinor,offer.price.currency);
  const rating=document.createElement("div"); rating.className="rating";
  if(offer.rating){const ratingValue=document.createElement("b");ratingValue.textContent=`★ ${offer.rating.value.toFixed(1)}`;const count=document.createElement("small");count.textContent=`${offer.rating.count.toLocaleString()} ratings`;rating.append(ratingValue,count);}
  else {const live=document.createElement("span");live.textContent="Live availability";rating.append(live);}
  bottom.append(price,rating); body.append(seller,title,description,features,bottom); button.append(rank,image,body);
  button.addEventListener("click",()=>selectOffer(offer));
  return button;
}

function renderOfferSkeleton(index) {
  const card=document.createElement("article");card.className="offer-skeleton";card.setAttribute("aria-hidden","true");card.style.setProperty("--skeleton-index",String(index));
  const image=document.createElement("div");image.className="skeleton-image";
  const body=document.createElement("div");body.className="skeleton-body";
  for(const width of ["28%","82%","64%","92%","74%"]){const line=document.createElement("i");line.style.width=width;body.append(line);}
  const footer=document.createElement("div");footer.className="skeleton-footer";body.append(footer);card.append(image,body);return card;
}

function clearSearchProgress() {
  for(const timer of state.searchTimers)clearTimeout(timer);state.searchTimers=[];
  els.market.setAttribute("aria-busy","false");els.offersStage.dataset.loading="false";els.searchProgress.textContent="Inspect freely · your agent stages the proposal";
}

function renderSearchProgress() {
  $("#brief-query").textContent=state.goal.query;$("#brief-budget").textContent=money(Math.round(state.goal.budget*100),"USD");$("#brief-country").textContent=state.goal.country;
  $("#mandate-version").textContent="v1";els.mandateRating.value=String(state.mandate.minimumRating);els.mandateReviews.value=String(state.mandate.minimumReviews);$("#catalog-count").textContent="Querying live UCP inventory";
  els.grid.replaceChildren(...Array.from({length:6},(_,index)=>renderOfferSkeleton(index)));els.dock.hidden=true;els.market.setAttribute("aria-busy","true");els.offersStage.dataset.loading="true";$("#offers-summary").textContent="Searching live merchants";els.searchProgress.textContent="Connecting to Shopify Global Catalog";view("market");
  const stages=[[700,"Applying mandate rules","Checking price, availability, and reputation"],[1600,"Ranking eligible offers","Preparing the shared decision room"]];
  state.searchTimers=stages.map(([delay,summary,detail])=>setTimeout(()=>{if(!state.busy)return;$("#offers-summary").textContent=summary;els.searchProgress.textContent=detail;},delay));
}

function selectOffer(offer,{agentStaged=false,tool=null}={}) {
  const decision=evaluateOffer(offer,state.mandate);
  if(!decision.eligible){toast("Blocked by mandate",decision.reasons[0]??"This offer does not satisfy the approved rules.",true);return;}
  state.selected=offer;state.staged=agentStaged?Object.freeze({variantId:offer.variantId,mandateVersion:state.mandateVersion}):null;
  for(const card of els.grid.children) card.classList.toggle("selected",card.dataset.variantId===offer.variantId);
  $("#selection-label").textContent=agentStaged?`Agent proposal · mandate v${state.mandateVersion}`:"Human focus · awaiting agent proposal";
  $("#selected-title").textContent=offer.title; $("#selected-seller").textContent=offer.seller.name; $("#selected-price").textContent=money(offer.price.amountMinor,offer.price.currency);
  $("#review-offer").disabled=!agentStaged;
  els.dock.hidden=false;
  addActivity(agentStaged?{actor:"agent",title:`Staged ${offer.seller.name}`,detail:`Mandate v${state.mandateVersion} · ${money(offer.price.amountMinor,offer.price.currency)}`,...(tool?{tool}:{})}:{actor:"you",title:"Focused a different candidate",detail:`${offer.seller.name} · agent restaging required`});
  setAuthority("absent",{reason:agentStaged?CAPABILITY_REASONS.HUMAN_GRANT_REQUIRED:CAPABILITY_REASONS.AGENT_STAGING_REQUIRED,actor:agentStaged?"agent":"human"});
}

function settlePendingApproval(result) {
  return state.pendingApproval?.handshake.settle(result)??false;
}

async function waitForHumanApproval(proposal,signal) {
  settlePendingApproval({outcome:"superseded",detail:"A newer agent proposal replaced this approval request."});
  const handshake=createApprovalHandshake({signal});
  const pending=Object.freeze({handshake,proposal});
  state.pendingApproval=pending;
  try{return await handshake.promise;}
  finally{if(state.pendingApproval===pending)state.pendingApproval=null;}
}

function stagedApprovalResult(proposal,decision) {
  const granted=decision.outcome==="granted";
  const text=granted
    ? `The human granted one-use authority for ${proposal.offer.title}. The dynamic tool ${ACTION_TOOL} is live now. Refresh the page's WebMCP tools and invoke it immediately with its exact frozen schema; do not ask the human for another message.`
    : `The staged proposal did not receive authority (${decision.outcome}). ${decision.detail??"No checkout capability exists."}`;
  return {content:[{type:"text",text}],proposal:{mandateVersion:proposal.mandateVersion,offer:offerSummary(proposal.offer)},humanDecision:decision,authority:snapshotCapability(state.capability),readback:mutationReadback(),nextAction:granted?{actor:"agent",action:"refresh_tools_and_execute",tool:ACTION_TOOL}:{actor:"agent",action:"report_without_checkout"}};
}

function renderMarket(payload) {
  clearSearchProgress();
  $("#brief-query").textContent=state.goal.query; $("#brief-budget").textContent=money(Math.round(state.goal.budget*100),"USD"); $("#brief-country").textContent=state.goal.country;
  $("#catalog-count").textContent=`${payload.totalCount.toLocaleString()} live matches · showing ${state.offers.length}`;
  const eligible=state.offers.filter((offer)=>evaluateOffer(offer,state.mandate).eligible).length;
  $("#offers-summary").textContent=`${eligible} eligible · ${state.offers.length-eligible} blocked · not cached`;
  $("#mandate-version").textContent=`v${state.mandateVersion}`;els.mandateRating.value=String(state.mandate.minimumRating);els.mandateReviews.value=String(state.mandate.minimumReviews);
  els.grid.replaceChildren(...state.offers.map(renderOffer)); els.dock.hidden=true; state.selected=null;state.staged=null; view("market");
}

async function runSearch(input=null) {
  if(state.busy)return null; state.busy=true;
  const previous=els.searchButton.querySelector("span").textContent;
  try {
    const proposal=input??readProposal();
    settlePendingApproval({outcome:"superseded",detail:"A new shopping search replaced the staged proposal."});
    state.activity=[];state.comparedVersions.clear();renderActivity();state.goal=validateGoal(proposal.goal??proposal); state.mandate=createMandate(state.goal,proposal.preferences??{minimumRating:proposal.minimumRating,minimumReviews:proposal.minimumReviews});state.mandateVersion=1; revoke("absent");resetCapabilityLedger();
    els.searchButton.disabled=true; els.searchButton.querySelector("span").textContent="Searching live merchants";
    addActivity({actor:input?"agent":"you",title:"Searching live catalog",detail:"Mandate v1 · Shopify Global Catalog",...(input?{tool:"intent_propose_purchase_mandate"}:{})});
    renderSearchProgress();
    const payload=await commerce("/v1/search",state.goal);
    state.offers=payload.offers.slice(0,6); renderMarket(payload);
    const eligible=state.offers.filter((offer)=>evaluateOffer(offer,state.mandate).eligible).length;
    addActivity({actor:input?"agent":"you",title:"Proposed mandate v1",detail:`${eligible} eligible · ${state.offers.length-eligible} blocked`,...(input?{tool:"intent_propose_purchase_mandate"}:{})});
    setAuthority("absent",{reason:CAPABILITY_REASONS.AGENT_STAGING_REQUIRED,actor:input?"agent":"human"});
    toast("Live market ready",`${state.offers.length} real offers arrived through UCP.`);
    return payload;
  } catch(error){clearSearchProgress();view("hero");toast("Search unavailable",error.message,true);throw error;}
  finally{state.busy=false;els.searchButton.disabled=false;els.searchButton.querySelector("span").textContent=previous;}
}

function applyMandate() {
  try {
    const previous=state.mandate;const previousStage=state.staged;
    const next=validateMandate({maxAmountMinor:state.mandate.maxAmountMinor,currency:state.mandate.currency,minimumRating:Number(els.mandateRating.value),minimumReviews:Number(els.mandateReviews.value)});
    state.mandate=next;state.mandateVersion+=1;revoke("absent",{reason:previousStage?CAPABILITY_REASONS.INVALIDATED_BY_MANDATE_VERSION:CAPABILITY_REASONS.AGENT_STAGING_REQUIRED,actor:"human"});settlePendingApproval({outcome:"invalidated",detail:`The human changed the mandate to v${state.mandateVersion}; compare and stage again.`});state.selected=null;state.staged=null;els.dock.hidden=true;
    const eligible=state.offers.filter((offer)=>evaluateOffer(offer,state.mandate).eligible).length;
    $("#offers-summary").textContent=`${eligible} eligible · ${state.offers.length-eligible} blocked · not cached`;$("#mandate-version").textContent=`v${state.mandateVersion}`;
    els.grid.replaceChildren(...state.offers.map(renderOffer));
    const changes=[];if(previous.minimumRating!==next.minimumRating)changes.push(`Rating ${previous.minimumRating.toFixed(1)} → ${next.minimumRating.toFixed(1)}`);if(previous.minimumReviews!==next.minimumReviews)changes.push(`Reviews ${previous.minimumReviews.toLocaleString()} → ${next.minimumReviews.toLocaleString()}`);
    addActivity({actor:"you",title:`Changed mandate to v${state.mandateVersion}`,detail:changes.join(" · ")||"Rules reconfirmed"});
    if(previousStage)addActivity({actor:"intent",title:"Invalidated stale proposal",detail:`Agent proposal belonged to mandate v${previousStage.mandateVersion}`});
    toast("Mandate updated",`Version ${state.mandateVersion}: ${eligible} of ${state.offers.length} offers are eligible.`);
  } catch(error){toast("Mandate unchanged",error.message,true);}
}

function populateApproval() {
  const offer=state.selected;if(!offer)return;
  els.authority.dataset.ready="true";
  els.lease.disabled=false;
  $("#approval-title").textContent=offer.title;$("#approval-seller").textContent=offer.seller.name;$("#approval-price").textContent=money(offer.price.amountMinor,offer.price.currency);
  const image=$("#approval-image");image.src=offer.image?.url??"/assets/intent-mark-v2.png";image.alt=offer.image?.alt??offer.title;
  $("#approval-mandate").textContent=`≤ ${money(state.mandate.maxAmountMinor,state.mandate.currency)} · ≥ ${state.mandate.minimumRating.toFixed(1)}★ · ≥ ${state.mandate.minimumReviews} reviews`;
  els.approvalState.textContent=state.authority.toUpperCase();els.approvalState.dataset.state=state.authority;els.leaseCount.textContent="60";renderCapabilityState();
}

function approvedScope() {
  const offer=state.selected;
  if(!offer||state.staged?.mandateVersion!==state.mandateVersion||state.staged.variantId!==offer.variantId)throw new Error("The agent proposal is missing or stale.");
  return Object.freeze({productId:offer.productId,variantId:offer.variantId,amountMinor:offer.price.amountMinor,currency:offer.price.currency,quantity:1,country:state.goal.country,maxAmountMinor:state.mandate.maxAmountMinor,minimumRating:state.mandate.minimumRating,minimumReviews:state.mandate.minimumReviews});
}

const CAPABILITY_COPY = Object.freeze({
  [CAPABILITY_REASONS.MANDATE_REQUIRED]: "No mandate yet · agent proposes first",
  [CAPABILITY_REASONS.AGENT_STAGING_REQUIRED]: "Absent · agent staging required",
  [CAPABILITY_REASONS.HUMAN_GRANT_REQUIRED]: "Absent · awaiting your one-use grant",
  [CAPABILITY_REASONS.HUMAN_GRANTED]: "Live · exactly one server-checked use",
  [CAPABILITY_REASONS.CONSUMED]: "Consumed · replay blocked",
  [CAPABILITY_REASONS.EXPIRED_UNUSED]: "Expired unused · no checkout opened",
  [CAPABILITY_REASONS.REVOKED_BY_HUMAN]: "Revoked by you · no checkout opened",
  [CAPABILITY_REASONS.INVALIDATED_BY_MANDATE_VERSION]: "Invalidated · mandate changed",
  [CAPABILITY_REASONS.REJECTED_BY_REVALIDATION]: "Rejected · live offer changed",
  [CAPABILITY_REASONS.LEASE_ISSUANCE_FAILED]: "Unavailable · grant was not created",
  [CAPABILITY_REASONS.EXECUTION_FAILED_CLOSED]: "Failed closed · authority removed"
});

function renderCapabilityState() {
  const capability=snapshotCapability(state.capability);const copy=CAPABILITY_COPY[capability.reason];
  if(els.approvalLifecycle)els.approvalLifecycle.textContent=copy;
  const heading=$("#authority-heading");
  if(heading)heading.textContent={
    [CAPABILITY_REASONS.MANDATE_REQUIRED]:"No capability exists",
    [CAPABILITY_REASONS.AGENT_STAGING_REQUIRED]:"No capability exists",
    [CAPABILITY_REASONS.HUMAN_GRANT_REQUIRED]:"Awaiting your approval",
    [CAPABILITY_REASONS.HUMAN_GRANTED]:"One-use capability live",
    [CAPABILITY_REASONS.CONSUMED]:"Authority consumed",
    [CAPABILITY_REASONS.EXPIRED_UNUSED]:"Authority expired unused",
    [CAPABILITY_REASONS.REVOKED_BY_HUMAN]:"Authority revoked",
    [CAPABILITY_REASONS.INVALIDATED_BY_MANDATE_VERSION]:"Proposal invalidated",
    [CAPABILITY_REASONS.REJECTED_BY_REVALIDATION]:"Offer changed · blocked",
    [CAPABILITY_REASONS.LEASE_ISSUANCE_FAILED]:"Capability unavailable",
    [CAPABILITY_REASONS.EXECUTION_FAILED_CLOSED]:"Execution blocked"
  }[capability.reason]??"Checkout authority";
  const lifecycle=$(".lifecycle-track");
  if(lifecycle){const position=capability.state==="live"?1:["used","expired"].includes(capability.state)?2:0;[...lifecycle.querySelectorAll("span")].forEach((item,index)=>item.classList.toggle("is-current",index===position));}
  if(els.receiptCapabilityReason){els.receiptCapabilityReason.textContent=capability.reason.toUpperCase();els.receiptCapabilityReason.dataset.reason=capability.reason;}
  if(els.receiptCapabilityNext){const next=capability.nextStep;els.receiptCapabilityNext.textContent=`Next: ${next.actor} · ${next.action.replaceAll("_"," ")}`;}
}

function setAuthority(nextState,event=null) {
  state.authority=nextState;
  els.authority.dataset.terminal=String(["used","expired"].includes(nextState));
  if(event)state.capability=transitionCapability(state.capability,{...event,state:nextState,mandateVersion:event.mandateVersion??(state.mandate?state.mandateVersion:null)});
  if(els.approvalState){els.approvalState.textContent=nextState==="live"?"LIVE · ONE USE":nextState.toUpperCase();els.approvalState.dataset.state=nextState;}
  renderCapabilityState();
}

function resetCapabilityLedger() {
  state.capability=createCapabilityLedger(ACTION_TOOL);setAuthority("absent");
}

function currentPlan() {
  return {goal:state.goal,mandate:state.mandate?{version:state.mandateVersion,...state.mandate}:null,selectedOffer:state.selected?offerSummary(state.selected):null,stagedProposal:state.staged,activity:state.activity,action:"open_exact_merchant_checkout",paymentSubmitted:false,authority:snapshotCapability(state.capability)};
}

function mutationReadback() {
  return createToolReadback({mandateVersion:state.mandateVersion,authority:snapshotCapability(state.capability)});
}

function revoke(nextState,event=null) {
  state.controller?.abort();clearTimeout(state.timeout);clearInterval(state.countdown);
  state.controller=null;state.timeout=null;state.countdown=null;state.grant=null;setAuthority(nextState,event);
}

async function receiptFingerprint(handoff) {
  const canonical=JSON.stringify({productId:handoff.productId,variantId:handoff.variantId,amountMinor:handoff.price.amountMinor,currency:handoff.price.currency,seller:handoff.seller.name,mandateVersion:state.mandateVersion,mandate:state.mandate,capability:ACTION_TOOL,state:"revoked_after_use"});
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical));const hex=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
  $("#receipt-hash").textContent=`sha256:${hex.slice(0,10)}…${hex.slice(-5)}`;
}

function renderReceipt(handoff) {
  $("#receipt-product").textContent=handoff.title;$("#receipt-merchant").textContent=handoff.seller.name;$("#receipt-price").textContent=money(handoff.price.amountMinor,handoff.price.currency);
  $("#receipt-mandate").textContent=`v${state.mandateVersion} · ≤${money(state.mandate.maxAmountMinor,state.mandate.currency)} · ≥${state.mandate.minimumRating.toFixed(1)}★ · ≥${state.mandate.minimumReviews} reviews`;
  const url=new URL(handoff.checkoutUrl);if(url.protocol!=="https:")throw new Error("The merchant returned an unsafe checkout URL.");
  $("#checkout-link").href=url.href;$("#checkout-link").textContent=`Continue to ${handoff.seller.name} →`;receiptFingerprint(handoff);view("receipt");
}

async function leaseCapability() {
  if(state.busy||!state.selected)return;
  if(state.staged?.mandateVersion!==state.mandateVersion||state.staged.variantId!==state.selected.variantId){toast("Agent proposal required","Ask your agent to stage this candidate under the current mandate before approval.",true);return;}
  if(!document.modelContext?.registerTool){toast("WebMCP required","Open Intent in a WebMCP-enabled browser to lease this action.",true);return;}
  state.busy=true;els.lease.disabled=true;
  const approved=approvedScope();const title=state.selected.title;const seller=state.selected.seller.name;
  try {
    revoke("absent");
    const leasePayload=await commerce("/v1/leases",approved);
    const scope=Object.freeze({...approved,leaseId:leasePayload.lease.id});
    state.grant=createSingleUseGrant({...scope,ttlMs:Math.min(LEASE_MS,Math.max(1_000,leasePayload.lease.expiresAt-Date.now()))});state.controller=new AbortController();const controller=state.controller;
    await document.modelContext.registerTool({
      ...createCheckoutToolContract({mandateVersion:state.mandateVersion,title,seller,displayPrice:money(scope.amountMinor,scope.currency),scope}),
      async execute(input){
        try{
          const authorized=state.grant?.consume(input);if(!authorized)throw new Error("Authority is no longer live.");
          const payload=await commerce("/v1/checkout-handoff",authorized);addActivity({actor:"agent",title:"Opened exact checkout",detail:`${payload.handoff.seller.name} · ${money(payload.handoff.price.amountMinor,payload.handoff.price.currency)}`,tool:ACTION_TOOL});revoke("used",{reason:CAPABILITY_REASONS.CONSUMED,actor:"agent"});addActivity({actor:"intent",title:"Consumed one-use authority",detail:"Replay is blocked server-side"});els.leaseCount.textContent="0";els.lease.textContent="Capability consumed";$("#authority-copy").textContent="The live offer was revalidated and the merchant handoff was returned. The one-use capability is gone and replay is blocked.";renderReceipt(payload.handoff);toast("Checkout handoff ready","Authority consumed. Payment was not submitted.");
          return {content:[{type:"text",text:`Exact offer revalidated. No payment was submitted. Merchant checkout: ${payload.handoff.checkoutUrl}`}],handoff:payload.handoff,authority:snapshotCapability(state.capability),readback:mutationReadback()};
        }catch(error){const reason=capabilityReasonForExecutionError(error.code);const terminalState=reason===CAPABILITY_REASONS.EXPIRED_UNUSED?"expired":"used";revoke(terminalState,{reason,actor:"server",errorCode:error.code});addActivity({actor:"intent",title:"Execution failed closed",detail:error.message});$("#authority-copy").textContent=`The attempt failed closed and authority was removed: ${error.message}`;els.lease.disabled=false;toast("Handoff failed closed",error.message,true);throw error;}
      }
    },{signal:controller.signal});
    setAuthority("live",{reason:CAPABILITY_REASONS.HUMAN_GRANTED,actor:"human"});addActivity({actor:"you",title:"Granted one-use authority",detail:`Mandate v${state.mandateVersion} · expires in 60 seconds`});els.lease.textContent="Waiting for your agent";$("#authority-copy").textContent=`Mandate v${state.mandateVersion} is frozen to this exact offer. Your waiting agent has been released and can continue automatically; no follow-up message is needed.`;settlePendingApproval({outcome:"granted",leaseId:scope.leaseId,detail:`${ACTION_TOOL} is live for one server-checked use.`});
    let remaining=60;state.countdown=setInterval(()=>{remaining-=1;els.leaseCount.textContent=String(Math.max(0,remaining));},1000);
    state.timeout=setTimeout(()=>{if(state.authority!=="live")return;revoke("expired",{reason:CAPABILITY_REASONS.EXPIRED_UNUSED,actor:"intent"});addActivity({actor:"intent",title:"Authority expired unused",detail:"No checkout was opened"});els.leaseCount.textContent="0";els.lease.disabled=false;els.lease.textContent="Grant one-use authority →";$("#authority-copy").textContent="The lease expired unused. No cart was opened and the capability is gone.";toast("Lease expired","No action was taken.");},LEASE_MS);
    toast("Authority granted","Your agent is continuing automatically.");
  }catch(error){revoke("absent",{reason:CAPABILITY_REASONS.LEASE_ISSUANCE_FAILED,actor:"server",errorCode:error.code});settlePendingApproval({outcome:"issuance_failed",detail:error.message,errorCode:error.code});els.lease.disabled=false;toast("Capability unavailable",error.message,true);}
  finally{state.busy=false;}
}

async function registerStaticTools() {
  const agentStatus=$("#agent-status");
  if(!document.modelContext?.registerTool){agentStatus.dataset.state="browsing";agentStatus.querySelector("b").textContent="Browsing mode";agentStatus.querySelector("span").textContent="Open Intent in a WebMCP-enabled client to collaborate with your agent.";return;}
  agentStatus.dataset.state="connected";agentStatus.querySelector("b").textContent="WebMCP agent connected";agentStatus.querySelector("span").textContent="The page’s four collaboration tools are available to your agent.";
  const tools=[
    {...staticToolContracts.propose,async execute(input){const goal=validateGoal({query:input.query,budget:input.budget,country:input.country});const payload=await runSearch({goal,preferences:{minimumRating:input.minimumRating,minimumReviews:input.minimumReviews}});return{content:[{type:"text",text:`Intent opened mandate v1 with ${state.offers.filter((offer)=>evaluateOffer(offer,state.mandate).eligible).length} eligible and ${state.offers.filter((offer)=>!evaluateOffer(offer,state.mandate).eligible).length} blocked live offers. Compare the candidates, then stage one eligible offer under mandate v1 for human review. No checkout authority exists.`}],mandate:state.mandate,offers:state.offers.map(offerSummary),source:payload.source,readback:mutationReadback()};}},
    {...staticToolContracts.compare,async execute(){if(!state.offers.length)return{content:[{type:"text",text:"No decision room exists. Use intent_propose_purchase_mandate first."}]};const candidates=state.offers.map(offerSummary);const audit=summarizeComparison(candidates.map(({decision})=>decision),state.mandateVersion);if(!state.comparedVersions.has(state.mandateVersion)){state.comparedVersions.add(state.mandateVersion);addActivity({actor:"agent",title:`Evaluated ${audit.candidateCount} candidates`,detail:`${audit.checkCount} deterministic checks · mandate v${audit.mandateVersion}`,tool:"intent_compare_candidates"});}return{content:[{type:"text",text:JSON.stringify({audit,candidates},null,2)}],audit,candidates};}},
    {...staticToolContracts.read,async execute(){const plan=currentPlan();const snapshot={goal:plan.goal,mandate:plan.mandate,selectedOffer:plan.selectedOffer,stagedProposal:plan.stagedProposal,activity:plan.activity,authority:plan.authority};return{content:[{type:"text",text:JSON.stringify(snapshot,null,2)}],snapshot};}},
    {...staticToolContracts.stage,async execute(input,{signal}={}){const proposal=stageCandidate({offers:state.offers,mandate:state.mandate,currentVersion:state.mandateVersion,requestedVersion:input.mandateVersion,variantId:input.variantId,authority:state.authority});selectOffer(proposal.offer,{agentStaged:true,tool:"intent_stage_candidate_for_approval"});populateApproval();$("#authority-copy").textContent="Your agent is waiting on this exact decision. Review the frozen handoff and grant once to let it continue automatically—no follow-up chat message needed.";view("authority");const decision=await waitForHumanApproval(proposal,signal);return stagedApprovalResult(proposal,decision);}}
  ];
  try{for(const tool of tools)await document.modelContext.registerTool(tool);}
  catch(error){console.error("Static WebMCP registration failed.",error);toast("WebMCP registration failed",error.message,true);}
}

function reset(){clearSearchProgress();revoke("absent");settlePendingApproval({outcome:"reset",detail:"The human ended this shopping decision."});state.goal=null;state.mandate=null;state.mandateVersion=1;state.offers=[];state.selected=null;state.staged=null;state.activity=[];state.comparedVersions.clear();resetCapabilityLedger();renderActivity();els.grid.replaceChildren();els.dock.hidden=true;els.authority.dataset.ready="false";els.lease.disabled=true;els.lease.textContent="Grant one-use authority →";$("#authority-copy").textContent="Your agent can search and compare. It cannot open a checkout until it stages one eligible offer and you grant a one-use capability.";view("hero");}

els.form.addEventListener("submit",(event)=>{event.preventDefault();runSearch().catch(()=>{});});
$("#apply-mandate").addEventListener("click",applyMandate);
$("#new-search").addEventListener("click",reset);
$("#review-offer").addEventListener("click",()=>{populateApproval();view("authority");});
$("#cancel-lease").addEventListener("click",()=>{const wasLive=state.authority==="live";const wasPending=Boolean(state.pendingApproval);if(wasLive||wasPending){revoke("absent",{reason:CAPABILITY_REASONS.REVOKED_BY_HUMAN,actor:"human"});settlePendingApproval({outcome:"declined",detail:"The human returned to the decision room without granting authority."});addActivity({actor:"you",title:wasLive?"Withdrew live authority":"Declined checkout authority",detail:"No checkout was opened"});}view("market");});
els.lease.addEventListener("click",leaseCapability);
$("#reset-button").addEventListener("click",reset);
$("#proof-button").addEventListener("click",()=>els.proof.showModal());
$("#proof-close").addEventListener("click",()=>els.proof.close());

const evaluations=runEvaluations();
$("#proof-score").textContent=`${evaluations.filter(item=>item.passed).length}/${evaluations.length}`;
els.proofList.replaceChildren(...evaluations.map(item=>{const li=document.createElement("li");if(!item.passed)li.className="failed";const mark=document.createElement("span");mark.textContent=item.passed?"✓":"×";const copy=document.createElement("div");const name=document.createElement("b");name.textContent=item.name;const meta=document.createElement("small");meta.textContent=`${item.id} · ${item.category}`;copy.append(name,meta);li.append(mark,copy);return li;}));
registerStaticTools();
renderCapabilityState();
