import "./StoreHeader.css";

export function StoreHeader() {
  return (
    <header className="store-header">
      <span className="store-header__logo-frame">
        <img
          className="store-header__logo"
          src="/products/logo.svg"
          alt="Heart Store"
        />
      </span>
    </header>
  );
}
