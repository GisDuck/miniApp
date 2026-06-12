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
  ready: () => void;
  expand: () => void;
  close: () => void;
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