export function deferToolUnregistration(controller, schedule = (callback) => setTimeout(callback, 0)) {
  if (!controller) return;
  schedule(() => controller.abort());
}
