const PORTFOLIO_ORIGIN = 'https://giosalad.dev';

export function portfolioFilmUrl(folder: string): string {
	return `${PORTFOLIO_ORIGIN}/film/${encodeURIComponent(folder)}`;
}
