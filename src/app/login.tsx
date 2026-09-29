import { AuthRouteScreen } from '@/components/auth-route-screen';
import { useRedirectSignedInUser } from '@/hooks/use-auth-routing';

export default function LoginScreen() {
  useRedirectSignedInUser();

  return <AuthRouteScreen variant="login" />;
}
