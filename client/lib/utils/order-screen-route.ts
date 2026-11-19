const ORDER_SCREEN_ROUTES = ["/procurement/new", "/procurement/edit"];

export function isOrderScreenRoute(pathname: string | null | undefined): boolean {
  return !!pathname && ORDER_SCREEN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`) || pathname.startsWith(`${route}?`));
}
