/**
 * Top bar: brand only (T-0413).
 * History: T-0113 mode nuit/info buttons → scène bottom-left; T-0153 tiroir des lectures removed;
 * T-0246 panel switch → side panel tabs; T-0325 info/réglages/légende/profondeur → info modal
 * (`PageInfo`); T-0411/12/13 time block (`PanneauTemps`) → scène bottom-center (`.coque-temps`);
 * visée bottom-left; lieu = "Site" card on scène.
 * Persistence alert shows on closed tiroir and NAMES its section (§11.3).
 */

export function BarreHaut() {
  return <h1>Orion</h1>
}
