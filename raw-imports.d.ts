declare module "*.html?raw" {
  const content: string;
  export default content;
}

declare module "*.well-known/ucp?raw" {
  const content: string;
  export default content;
}
