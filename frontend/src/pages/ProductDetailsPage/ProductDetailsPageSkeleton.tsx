import { Skeleton } from "../../components/Skeleton/Skeleton";
import "./ProductDetailsPageSkeleton.css";

export function ProductDetailsPageSkeleton() {
  return (
    <section className="product-details-skeleton">
      <Skeleton className="product-details-skeleton__image" />

      <div className="product-details-skeleton__body">
        <Skeleton className="product-details-skeleton__category" />
        <Skeleton className="product-details-skeleton__title" />

        <div className="product-details-skeleton__variants">
          <Skeleton className="product-details-skeleton__variant" />
          <Skeleton className="product-details-skeleton__variant product-details-skeleton__variant--short" />
          <Skeleton className="product-details-skeleton__variant" />
        </div>

        <Skeleton className="product-details-skeleton__description" />
        <Skeleton className="product-details-skeleton__description product-details-skeleton__description--short" />
      </div>

      <div className="product-details-action-skeleton">
        <Skeleton className="product-details-action-skeleton__price" />
        <Skeleton className="product-details-action-skeleton__button" />
      </div>
    </section>
  );
}
