export const tg = window.Telegram?.WebApp || null;

export function initTelegram() {
  tg?.ready?.();
  tg?.expand?.();
  tg?.disableVerticalSwipes?.();
}

export function telegramName() {
  return tg?.initDataUnsafe?.user?.first_name || 'Alpha67';
}

export function telegramInitData() {
  return tg?.initData || '';
}

export function telegramLanguage() {
  return tg?.initDataUnsafe?.user?.language_code || '';
}

export function telegramStartParam() {
  return tg?.initDataUnsafe?.start_param || '';
}

export const haptic = {
  light: () => tg?.HapticFeedback?.impactOccurred?.('light'),
  medium: () => tg?.HapticFeedback?.impactOccurred?.('medium'),
  heavy: () => tg?.HapticFeedback?.impactOccurred?.('heavy'),
  success: () => tg?.HapticFeedback?.notificationOccurred?.('success'),
  warning: () => tg?.HapticFeedback?.notificationOccurred?.('warning'),
  error: () => tg?.HapticFeedback?.notificationOccurred?.('error'),
  select: () => tg?.HapticFeedback?.selectionChanged?.(),
};
