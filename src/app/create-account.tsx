import { AuthRouteScreen } from '@/components/auth-route-screen';
import { useRedirectSignedInUser } from '@/hooks/use-auth-routing';

export default function CreateAccountScreen() {
  useRedirectSignedInUser();

  return <AuthRouteScreen variant="create" />;
}
