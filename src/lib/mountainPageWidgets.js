import MountainBoard from "../components/MountainBoard"
import EventsWidget from "../components/EventsWidget"
import ConditionsReportsWidget from "../components/ConditionsReportsWidget"

// Each widget's rolloutResorts is either 'all' (live everywhere) or an
// array of resortKeys (still in development — visible only on those
// resorts' Mountain Pages). Promoting a widget to every resort is a
// one-line change: flip its rolloutResorts to 'all', commit, deploy.
//
// MountainPage renders every widget's Component with exactly two props:
// { resortKey, currentUserEmail }. A widget must not require anything else.
export const MOUNTAIN_PAGE_WIDGETS = [
  { key: "board", label: "📋 Board", rolloutResorts: "all", Component: MountainBoard },
  { key: "reports", label: "📝 Recent Reports", rolloutResorts: "all", Component: ConditionsReportsWidget },
  { key: "events", label: "📅 Events", rolloutResorts: ["kramesbutte"], Component: EventsWidget },
]
