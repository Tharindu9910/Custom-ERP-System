import {
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
} from '@tanstack/react-router';
import { Root } from '@/routes/__root';
import { LoginPage } from '@/routes/login';
import { Layout } from '@/routes/_layout';
import { useAuthStore } from '@/shared/stores/auth.store';

function isAuthenticated() {
  return !!useAuthStore.getState().user;
}

// Root
const rootRoute = createRootRoute({ component: Root });

// Public: /login
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: () => {
    if (isAuthenticated()) throw redirect({ to: '/' });
  },
});

// Authenticated layout (pathless — no URL contribution)
const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
  component: Layout,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: '/login' });
  },
});

// / → dashboard placeholder (Phase 3 will replace this)
const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: () => (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <span className="text-5xl">⊞</span>
      <p className="mt-4 text-lg font-medium text-gray-600">
        Dashboard coming in Phase 3
      </p>
    </div>
  ),
});

export const routeTree = rootRoute.addChildren([
  loginRoute,
  layoutRoute.addChildren([indexRoute]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}