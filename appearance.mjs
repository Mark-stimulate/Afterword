export const palettes=[
 {id:'rose',name:'玫瑰信笺',description:'淡淡玫瑰，像一封慢慢写的信',color:'#a85270',night:false},
 {id:'lilac',name:'暮色鸢尾',description:'安静的浅紫，留一点想象的余地',color:'#79629e',night:false},
 {id:'peach',name:'蜜桃微光',description:'温暖的杏桃，让文字轻一点',color:'#ad6248',night:false},
 {id:'sage',name:'雨后鼠尾草',description:'柔和的绿，像翻开一本旧书',color:'#365b47',night:false},
 {id:'blue',name:'雾蓝来信',description:'清透的蓝，适合安静地读下去',color:'#4c7699',night:false},
 {id:'night',name:'午夜浆果',description:'深色的阅读空间，陪你写完这一页',color:'#c28fae',night:true}
];
export const fonts={sans:{name:'清晰 · 现代黑体',value:"'Microsoft YaHei','PingFang SC','Segoe UI',sans-serif"},serif:{name:'书信 · 温柔宋体',value:"'Songti SC','Noto Serif CJK SC','SimSun',Georgia,serif"},kai:{name:'手记 · 轻盈楷体',value:"'KaiTi','STKaiti','Kaiti SC','Songti SC',serif"}};
export const defaultAppearance={palette:'rose',color:'#a85270',font:'serif',size:17,spacing:2,night:false};
export function cleanAppearance(a={}){return {palette:palettes.some(p=>p.id===a.palette)||a.palette==='custom'?a.palette:'rose',color:/^#[0-9a-f]{6}$/i.test(a.color)?a.color:defaultAppearance.color,font:fonts[a.font]?a.font:'serif',size:[15,17,19,21].includes(+a.size)?+a.size:17,spacing:[1.7,2,2.3].includes(+a.spacing)?+a.spacing:2,night:a.night===true};}
function mix(hex,to,t){const a=hex.match(/\w\w/g).map(v=>parseInt(v,16)),b=to.match(/\w\w/g).map(v=>parseInt(v,16));return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');}
function luminance(hex){const c=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function themeVars(input){const a=cleanAppearance(input),n=a.night,c=a.color;let primary=c;
 if(!n){for(let i=0;contrast(primary,'#ffffff')<4.5&&i<40;i++)primary=mix(primary,'#000000',.06);}
 else{for(let i=0;contrast(primary,'#211c24')<4.5&&i<40;i++)primary=mix(primary,'#ffffff',.06);}
 return {'--bg':mix(c,n?'#17151c':'#fffdfb',n?.87:.96),'--paper':n?'#26222b':'#ffffff','--ink':n?'#f3eaf1':'#352c32','--muted':n?'#c4b7c3':'#716570','--line':mix(c,n?'#3b343f':'#eee7e9',.78),'--green':primary,'--on-primary':n?'#211c24':'#ffffff','--sage':mix(c,n?'#2e2732':'#fffdfb',.88),'--sidebar':mix(c,n?'#1e1922':'#f9f4f2',.90),'--accent':primary,'--reading-font':fonts[a.font].value,'--reading-size':a.size+'px','--reading-leading':String(a.spacing)};
}
