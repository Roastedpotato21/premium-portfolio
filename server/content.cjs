'use strict';
const types = {
  projects: {required:['title','slug'], text:['title','slug','short_description','full_description','category','development_status','icon','year'], urls:['github_url','live_demo_url'], images:['project_image'], arrays:['tech_stack','additional_images'], booleans:['featured']},
  certifications: {required:['certificate_name','issuer'],text:['certificate_name','issuer','credential_id','description','category'],urls:['credential_url'],images:['certificate_image'],dates:['issue_date']},
  achievements: {required:['title'],text:['title','organization','description','category'],urls:['proof_url'],images:['image'],dates:['date'],booleans:['featured']},
  skills: {required:['name'],text:['name','category','icon','proficiency']},
  experience: {required:['title','organization'],text:['title','organization','description','location','period'],dates:['start_date','end_date'],booleans:['current'],arrays:['technologies'],urls:['link']},
  education: {required:['degree','institution'],text:['degree','institution','field_of_study','description','location','period'],dates:['start_date','end_date']}
};
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function url(value,image=false){
  if(value==='')return value;
  if(image){
    if(/^https:\/\//.test(value)){try{const u=new URL(value);if(!u.username&&!u.password)return value;}catch{/* Report validation below. */}}
    if(/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(value))return value;
    if(/^images\/[a-zA-Z0-9/_ .-]+\.(png|jpe?g|webp|gif)$/.test(value)&&!value.includes('..'))return value;
    fail('Choose an uploaded image.');
  }
  try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail('Use a valid http or https URL.');return value;}catch{fail('Use a valid http or https URL.');}
}
function validate(type,input){
  const spec=types[type];if(!spec)fail('Unknown content section.',404);
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid item.');
  const result={};const keys=[...(spec.text||[]),...(spec.urls||[]),...(spec.images||[]),...(spec.dates||[]),...(spec.arrays||[]),...(spec.booleans||[])];
  const allowed=new Set([...keys,'status','display_order','id','created_at','updated_at','version']);
  for(const key of Object.keys(input))if(!allowed.has(key))fail(`Unknown field: ${key}.`);
  for(const key of keys){
    const value=input[key]??((spec.arrays||[]).includes(key)?[]:(spec.booleans||[]).includes(key)?false:'');
    if((spec.arrays||[]).includes(key)){
      if(!Array.isArray(value)||value.length>40||value.some(v=>typeof v!=='string'||v.length>200))fail(`${key}: use up to 40 short values.`);
      result[key]=value.map(v=>v.trim()).filter(Boolean);if(key==='additional_images')result[key].forEach(v=>url(v,true));
    }else if((spec.booleans||[]).includes(key)){if(typeof value!=='boolean')fail(`${key} must be true or false.`);result[key]=value;
    }else{
      if(typeof value!=='string'||value.length>(['full_description','description'].includes(key)?20000:['short_description'].includes(key)?3000:500))fail(`${key} is too long or invalid.`);
      result[key]=value.trim();
      if((spec.urls||[]).includes(key))url(result[key]);if((spec.images||[]).includes(key))url(result[key],true);
      if((spec.dates||[]).includes(key)&&value){const date=new Date(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)fail(`${key}: use a valid date.`);}
    }
  }
  for(const key of spec.required)if(!result[key])fail(`${key.replaceAll('_',' ')} is required.`);
  if(type==='projects'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug))fail('Slug must contain lowercase words separated by hyphens.');
  if(result.start_date&&result.end_date&&result.end_date<result.start_date)fail('End date must follow start date.');
  if(result.year&&!/^(19|20|21)\d{2}$/.test(result.year))fail('Use a four-digit project year.');
  if(!['draft','published'].includes(input.status))fail('Status must be draft or published.');result.status=input.status;
  return result;
}
module.exports={types,validate,fail,url};
