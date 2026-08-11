export function syncTransformAttachment(control, root, mode) {
  if (!root) {
    if (control.object) control.detach();
    return;
  }
  if (control.getMode() !== mode) control.setMode(mode);
  if (control.object !== root) control.attach(root);
}
