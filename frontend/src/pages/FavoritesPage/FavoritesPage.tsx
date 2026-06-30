import {
  CatalogPage,
  type Category,
  type Product,
} from "../CatalogPage/CatalogPage";

type FavoritesPageProps = {
  products: Product[];
  isProductsLoading: boolean;
  productsError: string | null;
  cartQuantityByVariantId: Record<string, number>;
  onCartCountChange: (cartCount: number) => void;
  onCartSnapshotChange: (cart: {
    totalQuantity: number;
    cartCount?: number;
    items?: Array<{ productVariantId: string; quantity: number }>;
  }) => void;
  onProductFavoriteChange: (productId: string, isFavorite: boolean) => void;
  onProductOpen: (productId: string, productVariantId?: string | null) => void;
  onNotify?: (message: string, type?: "error" | "success") => void;
};

const EMPTY_CATEGORIES: Category[] = [];

export function FavoritesPage({
  products,
  isProductsLoading,
  productsError,
  cartQuantityByVariantId,
  onCartCountChange,
  onCartSnapshotChange,
  onProductFavoriteChange,
  onProductOpen,
  onNotify,
}: FavoritesPageProps) {
  return (
    <CatalogPage
      categories={EMPTY_CATEGORIES}
      products={products}
      isCategoriesLoading={false}
      isProductsLoading={isProductsLoading}
      categoriesError={null}
      productsError={productsError}
      cartQuantityByVariantId={cartQuantityByVariantId}
      onCartCountChange={onCartCountChange}
      onCartSnapshotChange={onCartSnapshotChange}
      onProductFavoriteChange={onProductFavoriteChange}
      onProductOpen={onProductOpen}
      onNotify={onNotify}
      title="Избранное"
      showCategories={false}
      searchPlaceholder="Поиск по избранному"
      searchAriaLabel="Поиск по избранным товарам"
      emptyText="В избранном пока нет товаров"
      showOutOfStockSection
      outOfStockTitle="Товар закончился"
    />
  );
}
