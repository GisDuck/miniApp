import { ProductCardSkeleton } from "../../components/ProductCardSkeleton/ProductCardSkeleton";
import { Skeleton } from "../../components/Skeleton/Skeleton";

type CatalogPageSkeletonProps = {
  showCategories: boolean;
};

const PRODUCT_SKELETON_COUNT = 6;
const CATEGORY_SKELETON_WIDTHS = [70, 92, 84, 112];

export function CatalogPageSkeleton({
  showCategories,
}: CatalogPageSkeletonProps) {
  return (
    <>
      {showCategories && (
        <div className="catalog-categories catalog-categories--skeleton">
          {CATEGORY_SKELETON_WIDTHS.map((width, index) => (
            <Skeleton
              className="catalog-skeleton__category"
              key={index}
              style={{ width }}
            />
          ))}
        </div>
      )}

      <div className="catalog-grid">
        {Array.from({ length: PRODUCT_SKELETON_COUNT }, (_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </>
  );
}
