import { Skeleton } from "../../components/Skeleton/Skeleton";
import "./ProfileOrdersSkeleton.css";

type ProfileOrdersSkeletonProps = {
  variant?: "current" | "history";
};

export function ProfileOrdersSkeleton({
  variant = "current",
}: ProfileOrdersSkeletonProps) {
  if (variant === "history") {
    return (
      <div className="profile-orders-skeleton-list">
        {Array.from({ length: 2 }, (_, index) => (
          <article className="profile-order-history-skeleton" key={index}>
            <div className="profile-order-history-skeleton__header">
              <Skeleton className="profile-order-history-skeleton__title" />
              <Skeleton className="profile-order-history-skeleton__date" />
            </div>

            <div className="profile-order-history-skeleton__item">
              <Skeleton className="profile-order-history-skeleton__image" />
              <div className="profile-order-history-skeleton__info">
                <Skeleton className="profile-order-history-skeleton__line" />
                <Skeleton className="profile-order-history-skeleton__line profile-order-history-skeleton__line--short" />
              </div>
              <Skeleton className="profile-order-history-skeleton__price" />
            </div>

            <Skeleton className="profile-order-history-skeleton__total" />
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="profile-current-orders__list">
      {Array.from({ length: 2 }, (_, index) => (
        <article className="profile-current-order-skeleton" key={index}>
          <div className="profile-current-order-skeleton__top">
            <Skeleton className="profile-current-order-skeleton__title" />
            <Skeleton className="profile-current-order-skeleton__status" />
          </div>

          <div className="profile-current-order-skeleton__bottom">
            <div className="profile-current-order-skeleton__images">
              <Skeleton className="profile-current-order-skeleton__image" />
              <Skeleton className="profile-current-order-skeleton__image" />
              <Skeleton className="profile-current-order-skeleton__image" />
            </div>

            <Skeleton className="profile-current-order-skeleton__price" />
          </div>
        </article>
      ))}
    </div>
  );
}
