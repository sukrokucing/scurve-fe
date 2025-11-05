// Global Sonner configuration used by the app's root Toaster.
// Typed as Partial<ToasterProps> to match sonner's Toaster props without
// introducing a hard dependency on a specific runtime shape.
export type SonnerConfigShape = {
  position?:
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "top-center"
    | "bottom-center";
  duration?: number;
  rich?: boolean;
};

export const sonnerConfig: SonnerConfigShape = {
  // place toasts in the bottom-right by default (preferred for unobtrusive UX)
  position: "bottom-right",
  // default duration in milliseconds for non-persistent toasts
  duration: 4000,
  // allow rich React nodes as content
  rich: true,
};

export default sonnerConfig;
