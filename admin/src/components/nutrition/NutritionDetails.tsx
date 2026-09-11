import { Accordion, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { NutritionResult } from '../../lib/api';
import { colors } from '../../theme';

const ROWS: Array<{
	label: string;
	key: Exclude<keyof NutritionResult, 'title' | 'sourcesExplanation'>;
}> = [
	{ label: 'Calories', key: 'calories' },
	{ label: 'Total Fat (g)', key: 'totalFatG' },
	{ label: 'Saturated Fat (g)', key: 'saturatedFatG' },
	{ label: 'Polyunsaturated Fat (g)', key: 'polyunsaturatedFatG' },
	{ label: 'Monounsaturated Fat (g)', key: 'monounsaturatedFatG' },
	{ label: 'Trans Fat (g)', key: 'transFatG' },
	{ label: 'Cholesterol (mg)', key: 'cholesterolMg' },
	{ label: 'Sodium (mg)', key: 'sodiumMg' },
	{ label: 'Potassium (mg)', key: 'potassiumMg' },
	{ label: 'Total Carbs (g)', key: 'totalCarbsG' },
	{ label: 'Dietary Fiber (g)', key: 'dietaryFiberG' },
	{ label: 'Sugars (g)', key: 'sugarsG' },
	{ label: 'Added Sugars (g)', key: 'addedSugarsG' },
	{ label: 'Protein (g)', key: 'proteinG' },
	{ label: 'Vitamin A (%)', key: 'vitaminAPct' },
	{ label: 'Vitamin C (%)', key: 'vitaminCPct' },
	{ label: 'Calcium (%)', key: 'calciumPct' },
	{ label: 'Iron (%)', key: 'ironPct' },
	{ label: 'Vitamin D (%)', key: 'vitaminDPct' },
];

function formatValue(value: number | null): string {
	if (value == null || Number.isNaN(value)) return '—';
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function NutritionTableBody({
	result,
	rows = ROWS,
}: {
	result: NutritionResult;
	rows?: typeof ROWS;
}) {
	return (
		<Table
			horizontalSpacing="sm"
			verticalSpacing={6}
			withRowBorders={false}
			style={{ color: colors.text }}
		>
			<Table.Tbody>
				{rows.map((row) => (
					<Table.Tr key={row.key}>
						<Table.Td style={{ color: colors.textMuted, width: '70%' }}>
							{row.label}
						</Table.Td>
						<Table.Td ta="right" fw={600}>
							{formatValue(result[row.key])}
						</Table.Td>
					</Table.Tr>
				))}
			</Table.Tbody>
		</Table>
	);
}

function NutritionTable({
	result,
	twoColumn = false,
}: {
	result: NutritionResult;
	twoColumn?: boolean;
}) {
	const midpoint = Math.ceil(ROWS.length / 2);
	const leftRows = ROWS.slice(0, midpoint);
	const rightRows = ROWS.slice(midpoint);

	return (
		<Stack gap="xs">
			<Text size="xs" tt="uppercase" fw={700} c="dimmed">
				Nutrition
			</Text>
			{twoColumn ? (
				<SimpleGrid cols={2} spacing="md">
					<NutritionTableBody result={result} rows={leftRows} />
					<NutritionTableBody result={result} rows={rightRows} />
				</SimpleGrid>
			) : (
				<NutritionTableBody result={result} />
			)}
		</Stack>
	);
}

function SourcesSection({ explanation }: { explanation: string }) {
	return (
		<Stack gap="xs">
			<Text size="xs" tt="uppercase" fw={700} c="dimmed">
				Sources & method
			</Text>
			<Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
				{explanation}
			</Text>
		</Stack>
	);
}

const accordionStyles = {
	item: {
		background: colors.panel,
		border: `1px solid ${colors.panelBorder}`,
	},
	control: {
		color: colors.text,
	},
	label: {
		fontSize: 12,
		fontWeight: 700,
		textTransform: 'uppercase' as const,
		color: colors.textMuted,
	},
	content: {
		paddingTop: 0,
	},
};

export function NutritionDetails({ result }: { result: NutritionResult }) {
	const isDesktop = useMediaQuery('(min-width: 48em)') ?? false;

	if (isDesktop) {
		return (
			<Stack gap="xl">
				<NutritionTable result={result} twoColumn />
				<SourcesSection explanation={result.sourcesExplanation} />
			</Stack>
		);
	}

	return (
		<Accordion
			multiple
			defaultValue={['nutrition']}
			variant="separated"
			radius="md"
			styles={accordionStyles}
		>
			<Accordion.Item value="nutrition">
				<Accordion.Control>Nutrition</Accordion.Control>
				<Accordion.Panel>
					<NutritionTableBody result={result} />
				</Accordion.Panel>
			</Accordion.Item>
			<Accordion.Item value="sources">
				<Accordion.Control>Sources & method</Accordion.Control>
				<Accordion.Panel>
					<Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
						{result.sourcesExplanation}
					</Text>
				</Accordion.Panel>
			</Accordion.Item>
		</Accordion>
	);
}

export type NutritionItemDetails = {
	id: string;
	name: string;
	result: NutritionResult;
};

/** Multi-item meal details: desktop collapses per item (table + sources together). */
export function NutritionMealDetails({ items }: { items: NutritionItemDetails[] }) {
	const isDesktop = useMediaQuery('(min-width: 48em)') ?? false;

	if (items.length === 0) return null;

	if (items.length === 1) {
		return <NutritionDetails result={items[0].result} />;
	}

	if (isDesktop) {
		return (
			<Accordion
				multiple
				defaultValue={[items[0].id]}
				variant="separated"
				radius="md"
				styles={{
					...accordionStyles,
					label: {
						fontSize: 14,
						fontWeight: 600,
						textTransform: 'none' as const,
						color: colors.text,
					},
					content: {
						paddingTop: 12,
					},
				}}
			>
				{items.map((item) => {
					const cal =
						item.result.calories != null
							? `${Math.round(item.result.calories)} cal`
							: null;
					return (
						<Accordion.Item key={item.id} value={item.id}>
							<Accordion.Control>
								<Stack gap={2}>
									<Text fw={600} size="sm" style={{ color: colors.text }}>
										{item.name}
									</Text>
									{cal ? (
										<Text size="xs" c="dimmed">
											{cal}
										</Text>
									) : null}
								</Stack>
							</Accordion.Control>
							<Accordion.Panel>
								<NutritionDetails result={item.result} />
							</Accordion.Panel>
						</Accordion.Item>
					);
				})}
			</Accordion>
		);
	}

	return (
		<Stack gap="xl">
			{items.map((item) => (
				<Stack key={item.id} gap="sm">
					<Text fw={600}>{item.name}</Text>
					<NutritionDetails result={item.result} />
				</Stack>
			))}
		</Stack>
	);
}
