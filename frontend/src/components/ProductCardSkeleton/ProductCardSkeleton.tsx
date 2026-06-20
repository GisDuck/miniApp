import { Skeleton } from "../Skeleton/Skeleton";
import "./ProductCardSkeleton.css";

export function ProductCardSkeleton() {
  return (
    <article className="product-card-skeleton">
      <Skeleton className="product-card-skeleton__image" />

      <div className="product-card-skeleton__body">
        <Skeleton className="product-card-skeleton__title" />

        <div className="product-card-skeleton__footer">
          <Skeleton className="product-card-skeleton__price" />
          <Skeleton className="product-card-skeleton__button" />
        </div>
      </div>
    </article>
  );
}
