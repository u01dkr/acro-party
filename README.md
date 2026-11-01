# Acro Party 🎉

The acronym party game for 3–8 friends and family. 7 rounds, random letters, a random category, anonymous voting and a leaderboard.

## Setup (about 15 minutes, no coding)

### 1. Put the code on GitHub
1. Go to github.com → **New repository** → name it `acro-party` → **Create repository**.
2. Click **"uploading an existing file"**.
3. Drag in everything from this folder (the files *and* the `app`, `components` and `lib` folders) → **Commit changes**.

### 2. Set up Firebase
1. Go to console.firebase.google.com → **Create a project** → name it `acro-party` (Google Analytics: off is fine).
2. Click the **`</>`** (Web) icon → name it `acro-party` → **Register app**. You'll see a box of settings. Keep this tab open.
3. Left menu → **Build → Authentication → Get started** → choose **Anonymous** → switch on **Enable** → **Save**.
4. Left menu → **Build → Firestore Database → Create database** → pick location `eur3 (europe-west)` → **Production mode** → **Create**.
5. In Firestore, open the **Rules** tab → delete what's there → paste in everything from `firestore.rules` → **Publish**.

### 3. Put it live on Vercel
1. Go to vercel.com → **Add New → Project** → import `acro-party` from GitHub.
2. Open **Environment Variables** and add these four (values come from the Firebase settings box in step 2.2):

   | Name | Firebase value |
   |---|---|
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

   Optional: add `ANTHROPIC_API_KEY` (from console.anthropic.com) to turn on the 🤖 Claude decoy.
3. Click **Deploy**. When it's done, open the link on your phone and create a game!

If you add or change an environment variable later, go to **Deployments → ⋯ → Redeploy** for it to take effect.

## How to play
- Host taps **Create a new game** and shares the 4-letter code or the invite link.
- Everyone gets the same letters and category, and writes a phrase (e.g. **PTL** + Sport → *Pele Total Legend*).
- Vote anonymously for your favourite (not your own).
- **Scoring:** +1 per vote you get, +1 bonus for the top answer of the round, −1 if you vote for Claude's decoy.
- Leaderboard after every round. Highest score after 7 rounds wins.

## Tweaking
All the game settings (timers, number of rounds, categories, letters) are at the top of `lib/game.js`.
