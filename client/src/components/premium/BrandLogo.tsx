/** Logo oficial Sal Vita Premium (mesma imagem usada na landing). */
export const BRAND_LOGO_SRC = 'https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp';

export function BrandLogo({ size = 40, white = false }: { size?: number; white?: boolean }) {
  return (
    <img
      src={BRAND_LOGO_SRC}
      alt="Sal Vita Premium"
      width={Math.round((size * 282) / 189)}
      height={size}
      style={{ height: size, width: 'auto', objectFit: 'contain', filter: white ? 'brightness(0) invert(1)' : 'none' }}
    />
  );
}
