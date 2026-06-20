type TelegramWebAppUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
  };
  isFullscreen?: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  isVersionAtLeast?: (version: string) => boolean;
  requestFullscreen?: () => void;
  onEvent?: {
    (eventType: "fullscreenChanged", eventHandler: () => void): void;
    (eventType: "fullscreenFailed", eventHandler: (error: unknown) => void): void;
    (eventType: string, eventHandler: (...args: unknown[]) => void): void;
  };
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

export function initTelegramApp() {
  const tg = getTelegramWebApp();

  if (!tg) {
    return;
  }

  tg.ready();
  tg.expand();

  tg.onEvent?.("fullscreenChanged", () => {
    console.log("fullscreen:", tg.isFullscreen);
  });

  tg.onEvent?.("fullscreenFailed", (error) => {
    console.log("fullscreen failed:", error);
  });

  if (tg.isVersionAtLeast?.("8.0") && tg.requestFullscreen) {
    tg.requestFullscreen();
  }

  tg.setHeaderColor?.("#0b0d10");
  tg.setBackgroundColor?.("#0b0d10");
}

export function getTelegramInitData() {
  return getTelegramWebApp()?.initData ?? "";
}

export function getTelegramUser() {
  return getTelegramWebApp()?.initDataUnsafe.user ?? null;
}

export function telegramSuccessVibration() {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred("success");
}

export function telegramLightVibration() {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred("light");
}
