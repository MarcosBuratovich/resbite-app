# Motion and interface states — first iPhone test

The owner explicitly requires microanimations, splash/launch screens, loading states and a dynamic interface. These are part of the first-test scope, not optional end-of-project polish. The updated recommendation is **React Native with Expo and TypeScript**, using **Reanimated** for motion. Supabase Edge Functions also use TypeScript; database rules use SQL. This motion plan adds presentation behaviour to selected features, not new product capabilities.

## Launch experience

Separate the system launch screen from the app-controlled splash transition. Match the system launch background to the first app frame, then use a short branded reveal once application code is running. Apple's guidance distinguishes the launch screen from a splash/onboarding experience: [Launching](https://developer.apple.com/design/human-interface-guidelines/launching), [launch screen configuration](https://developer.apple.com/documentation/xcode/specifying-your-apps-launch-screen).

Proposed sequence: system launch → brief Resbite mark reveal / session restoration → sign-in, Discover or pending invitation. Do not require a fixed wait just to finish the animation. A returning foreground session does not replay the splash. A deep link retains its destination. If session restoration is slow or fails, show useful progress/retry/sign-out instead of an indefinitely looping logo. With Reduce Motion, use a static mark and brief dissolve.

## Motion inventory

Timing values below are starting design targets, not measured performance or new owner choices. Use native transitions where they already provide correct behaviour.

| Interaction | Normal motion / feedback | Reduced-motion alternative | Truthful state rule |
|---|---|---|---|
| Cold launch | Brief mark opacity/scale reveal, about 300–450 ms if time permits | Static mark / short dissolve | Never delay ready content for branding |
| Buttons and activity cards | Immediate small press response, about 100–160 ms; release smoothly | Colour/opacity response | Feedback starts immediately, even while request is pending |
| Navigation, sheets and setup steps | Native pushes/sheets; small content transition about 180–280 ms | System reduced-motion behaviour / short crossfade | Preserve back gesture, focus and form contents |
| Search/categories | Selected category transition and restrained result update | Instant selection or short fade | No full-screen replay on each typed character; cancel obsolete searches |
| First content load | Layout-matched placeholders; restrained shimmer only if needed | Static placeholders plus accessible progress text | Avoid flashing skeletons for instant local content |
| Refresh | Keep existing content; small inline progress indicator | Same content and status text | Do not erase a plan while refreshing |
| Register / sign in / confirm email | Stable button progress → next state; clear field-level errors | Text and status change without movement | No success before authentication/confirmation is validated |
| Save plan / RSVP | Pending control → confirmed state / checkmark; optional subtle success haptic | Stable confirmed text/icon | Success follows server acknowledgement; duplicate taps disabled only for the affected action |
| Network error | Inline error and retry fade in; preserve entered values | Direct text update | No celebratory motion or automatic loss of draft |
| Contact/group selection | Checkmark, selected-count update, restrained insert/remove | Immediate state plus announcement | No automatic sharing or invitation sending |
| Optional photo | Preview replacement and real upload progress | Short fade | Failure preserves prior photo and offers retry/remove |
| Cancel plan | Confirmation sheet; clear cancelled state after response | Immediate state change | Destructive action never inferred from an animation |
| Toast/status notice | Short fade/slide, about 150–220 ms | Fade or persistent status text | Essential errors/actions remain accessible; do not rely on a disappearing toast |
| Sample chat / wellness | Light entrance transition; sample charts may animate once | Static content | “Sample” labels remain visible; no simulated message sending or live tracking |

## Loading and failure model

Each asynchronous flow must define `idle`, `loading`, `success`, `empty` when meaningful, `error` and `retry`. Loading state describes an actual operation; never show invented percentage progress. Use an indeterminate indicator unless the API supplies meaningful progress.

Protect form layout from button-width jumps. Prevent duplicate save/RSVP operations while preserving navigation and recovery. Cancel view-scoped tasks when their destination is abandoned; guard against a late response replacing a newer screen. A long operation must offer explanatory text and recovery; timeouts report uncertainty and reconcile the server state before retrying a mutation with the same idempotency key.

Foregrounding, rapid repeated taps, backgrounding during a request, slow networks and cancelled authentication are explicit test cases. Animations never determine whether a backend operation succeeded.

## React Native implementation approach

Use shared TypeScript motion values and components: `motionPolicy`, `AsyncActionButton`, `LoadingPlaceholder`, `InlineStatus`, `LaunchCoordinator` and `LaunchView`. Use Reanimated for state-driven microinteractions and native-stack navigation for platform transitions. Scope animation to changing elements rather than whole screen trees.

Read React Native accessibility settings and Reanimated's reduced-motion support; respond when the system preference changes. Use Expo Haptics for optional tactile feedback; never make vibration the only signal. No sounds by default. Expo Splash Screen handles the launch handoff; the in-app branded reveal follows it without delaying readiness. Test standalone release builds, since development environments do not reproduce every launch detail. See [Reanimated integration](https://docs.expo.dev/versions/latest/sdk/reanimated/) and [Expo splash guidance](https://docs.expo.dev/versions/latest/sdk/splash-screen/).

Do not add CSS/DOM animation libraries to the native interface. Existing Lottie assets may be reviewed if useful; no Lottie/Rive dependency, plugin or new character-animation production is selected. Keep motion logic shared for Android, with separate device checks when Android enters scope.

## Performance and accessibility acceptance

- Measure scrolling/transitions on the oldest selected test iPhone. Target smooth display-paced motion, with 60 fps as the baseline on a 60 Hz device; do not claim results before profiling.
- No main-thread image decoding, synchronous network work or unnecessary whole-list animation during interaction.
- Normal and Reduce Motion paths both retain meaningful loading, success and error feedback. Disable nonessential zoom/bounce/shimmer in the reduced path.
- VoiceOver announces relevant status changes once, preserves focus after sheet/navigation transitions and does not repeatedly announce a spinner.
- Larger text does not clip loading labels or move action targets unexpectedly.
- Stop offscreen/decorative loops; no perpetual logo animation after launch completes.
- Capture short device recordings of launch, selection, navigation, loading → success, loading → error → retry, and reduced motion. Still screenshots cannot establish that motion works.

## Review before implementation

Include motion examples in the first screen review: launch reveal, activity press/navigation, a save/RSVP pending-to-success state and error recovery. Review these with the existing Resbite artwork and proposed brand tokens before propagating them across all screens. Animation timing/easing can be refined without reopening the agreed product scope.
