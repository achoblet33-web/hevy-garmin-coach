import test from "node:test";
import assert from "node:assert/strict";
import {routeToGpx} from "../web/runna-next/gpx-export.mjs";
import {renderRouteMap} from "../web/runna-next/kintra-map.mjs";
test("user-requested GPX contains coordinates and safely escapes workout title",()=>{
 const points=[[14.613,-60.990],[14.614,-60.989],[14.616,-60.988]];
 const xml=routeToGpx(points,'Course <privée> & journée');
 assert.match(xml,/application\/gpx|<gpx version/);
 assert.match(xml,/14\.6130000/);
 assert.match(xml,/-60\.9900000/);
 assert.match(xml,/&lt;privée&gt; &amp;/);
 assert.ok(!xml.includes("<privée>"));
 assert.match(renderRouteMap(points,false),/exportGpx/);
});
test("invalid or insufficient GPS is rejected and empty tracks cannot be exported",()=>{
 assert.throws(()=>routeToGpx([]),/absente/);
 assert.throws(()=>routeToGpx([[0,0],[91,2]]),/invalides/);
 assert.throws(()=>routeToGpx([[0,0],[null,2]]),/invalides/);
 assert.throws(()=>routeToGpx(Array.from({length:5001},()=>[0,0])),/trop longue/);
 assert.ok(!renderRouteMap([],false).includes("exportGpx"));
});
