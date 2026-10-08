// Android supplies the native implementation through Metro's platform resolver.
export async function signInWithGoogle(): Promise<{ message?: string }> {
  return { message: 'Google sign-in is available in the Android app.' };
}
