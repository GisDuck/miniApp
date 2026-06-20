import {
  CatalogPage,
  type Category,
  type Product,
} from "../CatalogPage/CatalogPage";

type FavoritesPageProps = {
  products: Product[];
  isProductsLoading: boolean;
  productsError: string | null;
  onCartCountChange: (cartCount: number) => void;
  onProductFavoriteChange: (productId: number, isFavorite: boolean) => void;
};

const EMPTY_CATEGORIES: Category[] = [];

export function FavoritesPage({
  products,
  isProductsLoading,
  productsError,
  onCartCountChange,
  onProductFavoriteChange,
}: FavoritesPageProps) {
  return (
    <CatalogPage
      categories={EMPTY_CATEGORIES}
      products={products}
      isCategoriesLoading={false}
      isProductsLoading={isProductsLoading}
      categoriesError={null}
      productsError={productsError}
      onCartCountChange={onCartCountChange}
      onProductFavoriteChange={onProductFavoriteChange}
      title="Избранное"
      showCategories={false}
      searchPlaceholder="Поиск по избранному"
      searchAriaLabel="Поиск по избранным товарам"
      loadingText="Загрузка избранного..."
      emptyText="В избранном пока нет товаров"
      showOutOfStockSection
      outOfStockTitle="Товар закончился"
    />
  );
}
