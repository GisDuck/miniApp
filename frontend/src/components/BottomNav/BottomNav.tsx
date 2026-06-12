import CatalogIcon from "../../assets/icons/catalog.svg?react";
import FavoriteIcon from "../../assets/icons/favorite.svg?react";
import CartIcon from "../../assets/icons/cart.svg?react";
import ProfileIcon from "../../assets/icons/profile.svg?react";

import "./BottomNav.css";

export type BottomNavTab = "catalog" | "favorites" | "cart" | "profile";

type BottomNavItem = {
  id: BottomNavTab;
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type BottomNavProps = {
  activeTab: BottomNavTab;
  cartCount?: number;
  onTabChange: (tab: BottomNavTab) => void;
};

const navItems: BottomNavItem[] = [
  {
    id: "catalog",
    label: "Каталог",
    Icon: CatalogIcon,
  },
  {
    id: "favorites",
    label: "Избранное",
    Icon: FavoriteIcon,
  },
  {
    id: "cart",
    label: "Корзина",
    Icon: CartIcon,
  },
  {
    id: "profile",
    label: "Профиль",
    Icon: ProfileIcon,
  },
];

export function BottomNav({
  activeTab,
  cartCount = 0,
  onTabChange,
}: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        const showCartCount = item.id === "cart" && cartCount > 0;
        const Icon = item.Icon;

        return (
          <button
            key={item.id}
            type="button"
            className={
              isActive
                ? "bottom-nav__button bottom-nav__button--active"
                : "bottom-nav__button"
            }
            onClick={() => onTabChange(item.id)}
          >
            <span className="bottom-nav__icon-wrap">
              <Icon className="bottom-nav__icon" aria-hidden="true" />

              {showCartCount && (
                <span className="bottom-nav__badge">{cartCount}</span>
              )}
            </span>

            <span className="bottom-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}