exports.handler = async (event) => {
  if(event.httpMethod==='OPTIONS') return{statusCode:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'},body:''};
  if(event.httpMethod!=='POST') return{statusCode:405,body:'Method not allowed'};
  try{
    const body=JSON.parse(event.body);
    console.log('Received body:',JSON.stringify(body));
    const message=body.message||body.msg||'hello';
    console.log('Message:',message);
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:message}]}]
      })
    });
    const data=await response.json();
    console.log('Gemini response:',JSON.stringify(data));
    const reply=data.candidates?.[0]?.content?.parts?.[0]?.text||'Sorry, I could not get a response.';
    return{
      statusCode:200,
      headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},
      body:JSON.stringify({reply})
    };
  }catch(e){
    console.log('Error:',e.message);
    return{statusCode:500,headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({error:e.message})};
  }
};