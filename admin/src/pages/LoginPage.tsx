import { useMemo } from 'react';
import { Button, Center, Stack, Title, Alert, Text, Box } from '@mantine/core';
import { IconBrandGoogle, IconAlertCircle } from '@tabler/icons-react';
import { colors } from '../theme';

const ERROR_MESSAGES: Record<string, string> = {
	denied: 'Google sign-in was cancelled',
	missing: 'Sign-in response was incomplete. Try again',
	state: 'Sign-in expired. Start again',
	forbidden: 'That Google account is not allowed on this dashboard',
	oauth: 'Google sign-in failed. Check server logs',
};

export function LoginPage() {
	const error = useMemo(() => {
		const code = new URLSearchParams(window.location.search).get('error');
		if (!code) return null;
		return ERROR_MESSAGES[code] || 'Sign-in failed';
	}, []);

	return (
		<Center
			h="100vh"
			style={{
				background: `radial-gradient(ellipse 70% 50% at 50% -20%, ${colors.gradientGlow}, transparent 55%), ${colors.bg}`,
			}}
		>
			<Stack maw={420} w="100%" px="md" align="center" gap="lg">
				<Box ta="center">
					<Title
						order={1}
						style={{
							fontSize: 'clamp(2.8rem, 10vw, 4.2rem)',
							letterSpacing: '-0.04em',
							lineHeight: 1,
							color: colors.text,
						}}
					>
						gHub
					</Title>
					<Text c="brown.2" mt="sm" size="md">
						Personal automation console. Sign in with your Google account
					</Text>
				</Box>

				{error && (
					<Alert color="denim" variant="light" icon={<IconAlertCircle size={16} />} w="100%">
						{error}
					</Alert>
				)}

				<Button
					component="a"
					href="/auth/google"
					size="md"
					color="forest"
					leftSection={<IconBrandGoogle size={18} />}
					fullWidth
					fw={700}
				>
					Sign in with Google
				</Button>
			</Stack>
		</Center>
	);
}
