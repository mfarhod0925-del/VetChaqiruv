import { useAuth } from "../../auth.jsx";
import { DEFAULT_REGION, REGIONS } from "../../lib/constants.js";
import { errText } from "../../lib/util.js";
import { useToast } from "../../toast.jsx";
import { RegionSelect } from "../../ui.jsx";

/** Chorvadorning tanlangan hududi (profilda saqlanadi). */
export function useArea() {
  const { profile } = useAuth();
  const region = REGIONS[profile?.region] ? profile.region : DEFAULT_REGION;
  const district = REGIONS[region].includes(profile?.district) ? profile.district : REGIONS[region][0];
  return { region, district };
}

export default function RegionBar() {
  const { updateProfile } = useAuth();
  const { region, district } = useArea();
  const toast = useToast();
  return (
    <div style={{ marginBottom: 6 }}>
      <RegionSelect compact idPrefix="bar" region={region} district={district}
        onChange={(r, d) => updateProfile({ region: r, district: d }).catch((e) => toast(errText(e)))} />
    </div>
  );
}
