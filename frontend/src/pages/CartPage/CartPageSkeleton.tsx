import { Skeleton } from "../../components/Skeleton/Skeleton";
import "./CartPageSkeleton.css";

const CART_ITEM_SKELETON_COUNT = 3;

export function CartPageSkeleton() {
  return (
    <>
      <div className="cart-skeleton-list">
        {Array.from({ length: CART_ITEM_SKELETON_COUNT }, (_, index) => (
          <article className="cart-item-skeleton" key={index}>
            <Skeleton className="cart-item-skeleton__image" />

            <div className="cart-item-skeleton__content">
              <Skeleton className="cart-item-skeleton__title" />
              <Skeleton className="cart-item-skeleton__controls" />
            </div>

            <Skeleton className="cart-item-skeleton__price" />
          </article>
        ))}
      </div>

      <div className="cart-action-skeleton">
        <div className="cart-action-skeleton__price-box">
          <Skeleton className="cart-action-skeleton__label" />
          <Skeleton className="cart-action-skeleton__price" />
        </div>

        <Skeleton className="cart-action-skeleton__button" />
      </div>
    </>
  );
}
