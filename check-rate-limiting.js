// Verificar y solucionar problema de rate limiting 429
const http = require('http');

function makeRequest(path, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function checkRateLimiting() {
  console.log('🔍 INVESTIGANDO ERROR 429 TOO MANY REQUESTS\n');

  // 1. Verificar si el backend está respondiendo
  try {
    const healthResponse = await makeRequest('/health', 'GET');
    
    if (healthResponse.statusCode === 200) {
      console.log('✅ Backend está respondiendo correctamente');
      console.log('   Health check exitoso');
    } else {
      console.log('❌ Backend no responde a health check:', healthResponse.statusCode);
    }
  } catch (error) {
    console.log('❌ Error conectando al backend:', error.message);
    console.log('   Asegúrate de que el backend esté corriendo en http://localhost:4000');
    return;
  }

  // 2. Intentar login con espera para evitar rate limiting
  console.log('\n🔐 INTENTANDO LOGIN CON ESPERA PARA EVITAR RATE LIMITING');
  
  const loginAttempts = [
    { email: 'admin@demo.com', password: 'Admin123!' },
    { email: 'chofer.agente1@demo.com', password: 'Chofer123!' },
    { email: 'chofer1@demo.com', password: '123456' }
  ];

  for (let i = 0; i < loginAttempts.length; i++) {
    const credentials = loginAttempts[i];
    
    console.log(`\n📝 Intento ${i + 1}: ${credentials.email}`);
    
    // Esperar entre intentos para evitar rate limiting
    if (i > 0) {
      console.log('   ⏱️ Esperando 2 segundos para evitar rate limiting...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    try {
      const response = await makeRequest('/api/v1/auth/login', 'POST', credentials);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log('✅ LOGIN EXITOSO:');
        console.log(`   Email: ${credentials.email}`);
        console.log(`   Usuario: ${data.data?.user?.fullName || data.data?.user?.name}`);
        console.log(`   Rol: ${data.data?.user?.role}`);
        console.log(`   Token: ${data.data?.token?.substring(0, 20)}...`);
        
        // Si es admin, verificar que podemos usar el token
        if (credentials.email === 'admin@demo.com') {
          console.log('\n🔍 VERIFICANDO TOKEN DE ADMIN...');
          
          try {
            const shipmentsResponse = await makeRequest('/api/v1/shipments', 'GET', null, {
              'Authorization': `Bearer ${data.data?.token}`
            });
            
            if (shipmentsResponse.statusCode === 200) {
              const shipmentsData = JSON.parse(shipmentsResponse.body);
              console.log('✅ Token de admin funciona correctamente');
              console.log(`   Envíos disponibles: ${shipmentsData.data?.length || 0}`);
            } else {
              console.log('❌ Token de admin no funciona:', shipmentsResponse.statusCode);
            }
          } catch (error) {
            console.log('❌ Error verificando token de admin:', error.message);
          }
        }
        
        break; // Salir del loop si el login fue exitoso
        
      } else if (response.statusCode === 429) {
        console.log('❌ ERROR 429: Too Many Requests');
        console.log('   El backend está aplicando rate limiting');
        console.log('   Esperando 5 segundos antes del siguiente intento...');
        
        // Esperar más tiempo si hay rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } else {
        console.log(`❌ Error login: ${response.statusCode}`);
        console.log(`   Respuesta: ${response.body}`);
      }
      
    } catch (error) {
      console.log(`❌ Error en intento ${i + 1}:`, error.message);
    }
  }

  // 3. Recomendaciones para evitar el 429
  console.log('\n💡 RECOMENDACIONES PARA EVITAR ERROR 429:');
  console.log('1. ESPERAR entre intentos de login (2-5 segundos)');
  console.log('2. EVITAR múltiples pestañas con la misma cuenta');
  console.log('3. LIMPIAR caché del navegador si es necesario');
  console.log('4. USAR credenciales diferentes para cada rol');
  console.log('5. REINICIAR el backend si el rate limiting persiste');
  
  console.log('\n🔧 SOLUCIONES INMEDIATAS:');
  console.log('✅ Espera 30 segundos antes de intentar login nuevamente');
  console.log('✅ Use una ventana de incógnito del navegador');
  console.log('✅ Intente con credenciales diferentes');
  console.log('✅ Reinicie el backend si es necesario');
  
  console.log('\n🌐 INSTRUCCIONES PARA ACCEDER AHORA:');
  console.log('1. Espera 30 segundos para que el rate limiting se resetee');
  console.log('2. Abre http://localhost:5174/ en una ventana de incógnito');
  console.log('3. Intenta login con: admin@demo.com / Admin123!');
  console.log('4. Si funciona, ya puedes usar el sistema normalmente');
  console.log('5. Para acceso como chofer, intenta las credenciales mencionadas');
}

checkRateLimiting();
