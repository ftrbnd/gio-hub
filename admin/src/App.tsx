import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, Center, Loader } from '@mantine/core';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { PhotosPage } from './pages/PhotosPage';
import { AppShellLayout } from './components/AppShellLayout';
import { useMe } from './hooks/useMe';
import { colors } from './theme';

export function App() {
	const { data: me, isLoading } = useMe();

	if (isLoading) {
		return (
			<Center h="100vh" bg={colors.bg}>
				<Loader color="forest" />
			</Center>
		);
	}

	if (!me) {
		return <LoginPage />;
	}

	return (
		<Box bg={colors.bg} mih="100vh">
			<Routes>
				<Route element={<AppShellLayout email={me.email} />}>
					<Route index element={<HomePage />} />
					<Route path="photos" element={<PhotosPage />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Route>
			</Routes>
		</Box>
	);
}
