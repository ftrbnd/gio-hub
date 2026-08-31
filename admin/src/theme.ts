import { createTheme, MantineColorsTuple } from '@mantine/core';

/** Olive green accent — buttons, switches, primary actions. */
const forest: MantineColorsTuple = [
	'#eef0e6',
	'#d8dcc8',
	'#b8c0a0',
	'#98a478',
	'#788858',
	'#606848',
	'#505040',
	'#404830',
	'#303828',
	'#202818',
];

/** Warm gray accent — secondary outlines. */
const stone: MantineColorsTuple = [
	'#f0f0ee',
	'#e0e0dc',
	'#c8c8c4',
	'#a8a8a4',
	'#888884',
	'#686864',
	'#585854',
	'#484844',
	'#383834',
	'#282824',
];

/** Dark-wash denim — links, borders, highlights. */
const denim: MantineColorsTuple = [
	'#e4eaf0',
	'#c5d0dc',
	'#9aafc4',
	'#748da8',
	'#5a728c',
	'#465c74',
	'#3a4d62',
	'#2f3f52',
	'#243342',
	'#1a2835',
];

/** Mantine dark scale: light beige text (0) → deep brown surfaces (9). */
const brown: MantineColorsTuple = [
	'#F0E6D6',
	'#E0D4C0',
	'#D4C4A8',
	'#B0A080',
	'#8A7060',
	'#5C4838',
	'#3D3028',
	'#2A2218',
	'#1C1610',
	'#12100C',
];

export const colors = {
	bg: '#1C1610',
	bgDeep: '#12100C',
	panel: '#252018',
	panelBorder: 'rgba(176, 160, 128, 0.14)',
	denim: '#3a4d62',
	denimBorder: 'rgba(58, 77, 98, 0.55)',
	denimGlow: 'rgba(36, 51, 66, 0.45)',
	panelSelected: '#2a3542',
	imageWellSelected: '#1e2a38',
	grayAccentBorder: 'rgba(136, 136, 132, 0.32)',
	text: '#F0E6D6',
	textMuted: '#B0A080',
	green: '#505040',
	gray: '#888884',
	gradientGlow: 'rgba(45, 62, 82, 0.35)',
} as const;

export const panelStyle = {
	background: colors.panel,
	border: `1px solid ${colors.panelBorder}`,
} as const;

export const panelStyleAccent = {
	background: colors.panel,
	border: `1px solid ${colors.denimBorder}`,
} as const;

export const theme = createTheme({
	primaryColor: 'forest',
	fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
	headings: {
		fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
		fontWeight: '600',
	},
	defaultRadius: 'md',
	colors: {
		forest,
		stone,
		denim,
		brown,
		dark: brown,
	},
	black: colors.bgDeep,
	other: colors,
});
