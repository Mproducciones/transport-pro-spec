export type NotifyType = "success" | "error" | "info";

type NotifyDetail = {
  id: string;
  type: NotifyType;
  message: string;
};

const EVENT_NAME = "tp:notify";

export function notify(type: NotifyType, message: string) {
  const detail: NotifyDetail = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
  };
  window.dispatchEvent(new CustomEvent<NotifyDetail>(EVENT_NAME, { detail }));
}

export function onNotify(handler: (detail: NotifyDetail) => void) {
  const listener = (event: Event) => {
    const custom = event as CustomEvent<NotifyDetail>;
    if (custom.detail?.message) handler(custom.detail);
  };
  window.addEventListener(EVENT_NAME, listener as EventListener);
  return () => window.removeEventListener(EVENT_NAME, listener as EventListener);
}
