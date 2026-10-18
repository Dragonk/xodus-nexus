import { useEffect, useRef, useState } from 'react';
import { installGamepadNavigation } from './gamepad-navigation';
import { t } from './i18n';

export function GamepadNavigation({ back, page }: { back: () => void; page: (delta: number) => void }) {
  const callbacks = useRef({ back, page }); callbacks.current = { back, page };
  const [active, setActive] = useState(false);
  useEffect(() => installGamepadNavigation(window, {
    mode: setActive, back: () => callbacks.current.back(), page: delta => callbacks.current.page(delta),
  }), []);
  return active ? <div className="gamepad-hints" aria-label={t('gamepad.ariaLabel', 'Gamepad controls')}>
    <span>{t('gamepad.move', 'D-pad / L stick: Move')}</span><span>{t('gamepad.select', 'A: Select')}</span><span>{t('gamepad.back', 'B: Back')}</span><span>{t('gamepad.options', 'X: Options')}</span>
    <span>{t('gamepad.pages', 'LB / RB: Pages')}</span><span>{t('gamepad.scroll', 'R stick: Scroll')}</span><span>{t('gamepad.keyboard', 'Steam + X: Keyboard')}</span>
  </div> : null;
}
