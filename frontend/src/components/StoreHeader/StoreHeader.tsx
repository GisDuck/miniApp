import { isTelegramDesktop } from "../../shared/telegram";
import "./StoreHeader.css";

export function StoreHeader() {
  const headerClassName = isTelegramDesktop()
    ? "store-header store-header--desktop"
    : "store-header";

  return (
    <header className={headerClassName}>
      <span className="store-header__logo-frame">
        <img
          className="store-header__logo"
          src="/products/logo-header.svg"
          alt="Heart Store logo"
        />
      </span>
    </header>
  );
}
