import { Outlet, NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import {
	AppShell,
	Group,
	Text,
	Button,
	Burger,
	Stack,
	NavLink,
	Container,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendarEvent, IconHome, IconPhoto } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { logout } from '../lib/api';
import { BrandIcon } from './BrandIcon';
import { colors } from '../theme';

type Props = { email: string };

type NavItem = {
	to: string;
	label: string;
	end?: boolean;
	icon: ReactNode;
};

const personalNav: NavItem[] = [
	{ to: '/photos', label: 'Photos', icon: <IconPhoto size={18} /> },
	{ to: '/time-off', label: 'Time off', icon: <IconCalendarEvent size={18} /> },
];

const externalNav: NavItem[] = [
	{ to: '/discord', label: 'Discord', icon: <BrandIcon brand="discord" size={18} /> },
	{ to: '/spotify', label: 'Spotify', icon: <BrandIcon brand="spotify" size={18} /> },
	{ to: '/ticktick', label: 'TickTick', icon: <BrandIcon brand="ticktick" size={18} /> },
];

function NavSection({
	title,
	items,
	pathname,
	onNavigate,
}: {
	title: string;
	items: NavItem[];
	pathname: string;
	onNavigate: () => void;
}) {
	return (
		<Stack gap={4}>
			<Text size="xs" c="dimmed" tt="uppercase" fw={700} mt="sm" mb={4} px="xs">
				{title}
			</Text>
			{items.map((item) => (
				<NavLink
					key={item.to}
					component={RouterNavLink}
					to={item.to}
					end={item.end}
					label={item.label}
					leftSection={item.icon}
					onClick={onNavigate}
					color="forest"
					variant="filled"
					active={
						item.end ? pathname === '/' : pathname.startsWith(item.to)
					}
				/>
			))}
		</Stack>
	);
}

export function AppShellLayout({ email }: Props) {
	const [opened, { toggle, close }] = useDisclosure();
	const location = useLocation();

	return (
		<AppShell
			header={{ height: 64 }}
			navbar={{
				width: 220,
				breakpoint: 'sm',
				collapsed: { mobile: !opened },
			}}
			padding="md"
			styles={{
				main: { background: colors.bg },
				header: {
					background: colors.panel,
					borderBottom: `1px solid ${colors.denimBorder}`,
				},
				navbar: {
					background: colors.panel,
					borderRight: `1px solid ${colors.panelBorder}`,
				},
			}}
		>
			<AppShell.Header>
				<Group h="100%" px="md" justify="space-between">
					<Group>
						<Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" color="forest" />
						<Text fw={700} size="xl" style={{ letterSpacing: '-0.03em', color: colors.text }}>
							gHub
						</Text>
					</Group>
					<Group gap="sm">
						<Text size="sm" c="brown.2" visibleFrom="xs">
							{email}
						</Text>
						<Button
							variant="outline"
							color="stone"
							size="xs"
							onClick={() => {
								void logout().then(() => {
									window.location.href = '/';
								});
							}}
						>
							Sign out
						</Button>
					</Group>
				</Group>
			</AppShell.Header>

			<AppShell.Navbar p="md">
				<Stack gap={4}>
					<NavLink
						component={RouterNavLink}
						to="/"
						end
						label="Overview"
						leftSection={<IconHome size={18} />}
						onClick={close}
						color="forest"
						variant="filled"
						active={location.pathname === '/'}
					/>

					<NavSection
						title="Personal"
						items={personalNav}
						pathname={location.pathname}
						onNavigate={close}
					/>

					<NavSection
						title="Services"
						items={externalNav}
						pathname={location.pathname}
						onNavigate={close}
					/>
				</Stack>
			</AppShell.Navbar>

			<AppShell.Main>
				<Container size="lg" py="md">
					<Outlet />
				</Container>
			</AppShell.Main>
		</AppShell>
	);
}
