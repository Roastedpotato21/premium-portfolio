/* Public cards and admin previews use the same safe DOM renderer. */
(() => {
 'use strict';
 const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;};
 function link(label,url,className){const a=node('a',className,label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
 function image(src,alt,className){const img=node('img',className);img.src=src;img.alt=alt;img.loading='lazy';img.decoding='async';return img;}
 function render(type,item){let card;
  if(type==='projects'){
   card=node('div','project-card');card.dataset.slug=item.slug;card.append(item.project_image?image(item.project_image,item.title,'cms-project-image'):node('div','project-visual',item.icon||'↗'));
   const meta=node('div','project-meta');meta.append(node('span','project-category',item.category),node('span','project-status',item.development_status));card.append(meta,node('h3','project-title',item.title),node('p','project-description',item.short_description));
   const stack=node('div','tech-stack');item.tech_stack.forEach(t=>stack.append(node('span','tech-badge',t)));card.append(stack);const links=node('div','project-links');if(item.github_url)links.append(link('View Project',item.github_url,'project-link'));if(item.live_demo_url)links.append(link('Live Demo',item.live_demo_url,'project-link'));card.append(links);
  }else if(type==='certifications'){
   card=node('div','cert-card');card.append(node('div','cert-category',item.category),node('div','cert-name',item.certificate_name),node('div','cert-issuer',item.issuer));if(item.issue_date)card.append(node('p','cert-issuer',item.issue_date));
   if(item.certificate_image){const button=node('button','cert-btn','View Certificate');button.type='button';Object.assign(button.dataset,{label:item.certificate_name,src:item.certificate_image,type:'image'});card.append(button);}if(item.credential_url)card.append(link('Verify Credential',item.credential_url,'cert-btn'));
  }else if(type==='achievements'){
   card=node('figure','achievement-card'+(item.featured?' achievement-card--featured':''));if(item.image){const a=link('',item.image);a.setAttribute('aria-label','View '+item.title+' at full size (opens in a new tab)');const img=image(item.image,item.description||item.title);img.width=item.featured?1600:1080;img.height=item.featured?743:1080;a.append(img);card.append(a);}card.append(node('figcaption','',item.title));if(item.proof_url)card.append(link('View proof',item.proof_url,'project-link'));
  }else if(type==='skills'){
   card=node('button','skill-chip',item.name);card.type='button';card.setAttribute('aria-pressed','false');if(item.category)card.title=item.category;
  }else{
   card=node('div','timeline-item');card.append(node('div','timeline-date',item.period||[item.start_date,item.current?'Present':item.end_date].filter(Boolean).join(' – ')),node('div','timeline-title',type==='education'?item.degree:item.title));const organization=node('p','cms-timeline-description',type==='education'?item.institution:item.organization);if(type==='education'||item.organization!==item.title)card.append(organization);if(item.description)card.append(node('p','cms-timeline-description',item.description));
  }card.dataset.itemId=item.id||'';return card;
 }
 const targets={projects:'#projectsGrid',certifications:'#certGrid',achievements:'#achievements .achievement-grid',skills:'#skillsContainer',experience:'#timeline',education:'#education .timeline'};let last='',loading=false;
 async function refresh(force=false){if(!document.querySelector('#projectsGrid')||loading)return;if(!force&&document.querySelector('[contenteditable="true"]'))return;loading=true;
  try{const response=await fetch('/api/content',{cache:'no-store'});if(!response.ok)throw Error('Could not load portfolio content.');const data=await response.json(),snapshot=JSON.stringify(data);if(snapshot===last)return;
   for(const [type,selector]of Object.entries(targets)){const container=document.querySelector(selector);container.replaceChildren(...data[type].map(item=>render(type,item)));if(!data[type].length)container.append(node('p','cms-empty','New content coming soon.'));}
   for(const [id,text]of Object.entries(data.site)){
    const el=document.getElementById(id);if(!el||!el.hasAttribute('contenteditable')||el.textContent.trim()===text.trim())continue;
    el.replaceChildren();const pattern=id==='heroTitle'?/(Siri|👋)/:id==='heroSubtitle'?/(AI agents)/:null;
    if(!pattern){el.textContent=text;continue;}
    for(const part of text.split(pattern)){if(pattern.test(part)){const styled=node(part==='👋'?'span':'strong',part==='👋'?'hero-wave':'',part);if(part==='👋')styled.setAttribute('aria-label','Hello');el.append(styled);}else el.append(document.createTextNode(part));}
   }last=snapshot;document.getElementById('cmsLoadStatus').textContent='';document.dispatchEvent(new Event('portfolio:content-updated'));
  }catch(e){document.getElementById('cmsLoadStatus').textContent='Portfolio content is unavailable. Please refresh or open the CMS server URL.';}finally{loading=false;}
 }
 window.portfolioCMS=Object.freeze({render,refresh});if(document.querySelector('#projectsGrid')){refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('focus',()=>refresh());}
})();
