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
import { IconLogout, IconPhoto, IconHome } from '@tabler/icons-react';
import { logout } from '../lib/api';
import { colors } from '../theme';

type Props = { email: string };

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
							leftSection={<IconLogout size={14} />}
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
						label="Home"
						leftSection={<IconHome size={18} />}
						onClick={close}
						color="forest"
						variant="filled"
						active={location.pathname === '/'}
					/>
					<NavLink
						component={RouterNavLink}
						to="/photos"
						label="Photos"
						leftSection={<IconPhoto size={18} />}
						onClick={close}
						color="forest"
						variant="filled"
						active={location.pathname.startsWith('/photos')}
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
