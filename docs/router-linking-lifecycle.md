# SDK 57 initial linking lifecycle guard

The reported Android warning originates at `expo-router/build/fork/useLinking.native.js`: its launch URL promise calls `onUnhandledLinking`, which is a React state setter, while the initial navigation tree may not have committed. It also calls that setter if the URL resolves after the tree is discarded. A synchronous launch URL calls the setter during initialization too.

The installed Router 57.0.23 and the SDK-compatible 57.0.25 package both contain this callback. Updating that patch version alone does not change it.

`scripts/patch-expo-router-linking.cjs` queues the initial linking path until an effect marks the hook mounted. Once mounted, an asynchronous result can safely report its path. Cleanup disables further state updates. Initial navigation state parsing and live-link navigation are preserved.

The script patches the installed native hook and runs from `postinstall`, so the change survives dependency reinstalls. It is idempotent, checks the expected code before modifying it, and only applies to SDK 57. Reevaluate and remove it when migrating Router versions with an upstream lifecycle fix. No warning suppression is used.

After applying the patch, restart Metro with `npx expo start --clear` and reload the development app. Changing this JavaScript callback does not require regenerating native projects.

`scripts/router-linking-lifecycle.test.cjs` executes the installed hook with simulated mount/teardown effects. Before the patch, three cases failed: a launch URL resolving before mount, a URL resolving after teardown, and synchronous initialization. All five scenarios pass afterward, including normal launch URL handling and live-link dispatch. Physical Android cold starts, password recovery links, push opens, and Fast Refresh still need device verification.
