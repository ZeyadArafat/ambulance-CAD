const statuses=['AVAILABLE','EN ROUTE','ON SCENE','TRANSPORTING','AT HOSPITAL','OUT OF SERVICE']
const capabilities=['GENERAL','CRITICAL CARE','MATERNAL','NEONATAL']
export const initialUnits=Array.from({length:20},(_,i)=>({
 id:`AMB-${String(i+1).padStart(2,'0')}`,
 callSign:`MEDIC-${String(i+1).padStart(2,'0')}`,
 status:statuses[[0,0,1,2,3,4,0,5,0,1,0,2,3,0,1,4,0,5,0,2][i]],
 homeZone:`Z-${String((i%10)).padStart(2,'0')}`,
 capability:capabilities[[0,1,0,2,0,3,1,0,2,0,1,0,3,0,1,2,0,0,1,0][i]],
 eta:[0,0,6,4,8,12,0,0,0,5,0,3,7,0,4,9,0,0,2,5][i],
 distance:[0,0,2.4,1.8,4.1,6.7,0,0,0,2.1,0,1.3,3.8,0,2.7,5.4,0,0,0.9,2.9][i],
 assignedIncident:null
}))
