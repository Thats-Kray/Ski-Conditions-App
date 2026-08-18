import { createContext, useContext } from "react"

/**
 * Lets any descendant open a full-page profile without prop drilling.
 *
 * UserProfileModal has five call sites — TodaysCrew, PowderMap, CrewGroupChat
 * (nested inside MessagingCenter inside FriendsPage), FriendsPage, and the
 * shared ui/AvatarStatusRail primitive. Threading a callback to all of them
 * would touch seven files and put a navigation concern into a ui/ primitive's
 * public API. This touches two and leaves every call site unchanged.
 *
 * Provided in App.jsx. The default is a no-op so components still render fine
 * outside a provider (e.g. if one is ever mounted in isolation).
 */
export const ProfileNavContext = createContext(() => {})

export function useProfileNav() {
  return useContext(ProfileNavContext)
}
