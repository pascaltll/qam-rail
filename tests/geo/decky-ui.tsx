import { createElement as h } from "react";
const box = (tag: string) => ({ children, style, onActivate, onClick, ...rest }: Record<string, unknown>) =>
  h(tag, { style, "data-focusable": "1", "data-qr": rest["data-qr"], "data-qr-h": rest["data-qr-h"], "data-qr-seg": rest["data-qr-seg"], role: rest["role"], "aria-label": rest["aria-label"], onClick: (onActivate ?? onClick) as () => void }, children as never);
export const Focusable = box("div"); export const DialogButton = box("button"); export const ModalRoot = box("div");
export const TextField = ({ value, onChange, placeholder }: Record<string, unknown>) => h("input", { value, onChange, placeholder } as never);
export const Navigation = { Navigate() {}, NavigateToSteamWeb() {}, NavigateToChat() {} };
export const Router = {}; export const showModal = () => {}; export const findModuleExport = () => undefined;
export const PanelSection = box("div"); export const PanelSectionRow = box("div"); export const ToggleField = box("div");
export const getGamepadNavigationTrees = () => []; export const staticClasses: Record<string, string> = {};
