// Verificar si el problema es por sesiones múltiples simultáneas
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

async function checkSimultaneousSessions() {
  console.log('🔍 INVESTIGANDO CONFLICTO DE SESIONES MÚLTIPLES\n');

  // 1. Verificar si el backend permite múltiples sesiones del mismo usuario
  console.log('📝 PRUEBA 1: Login múltiple con misma cuenta');
  
  let session1Token = null;
  let session2Token = null;
  
  try {
    // Primera sesión
    const session1Response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (session1Response.statusCode === 200) {
      const session1Data = JSON.parse(session1Response.body);
      session1Token = session1Data.data?.token;
      console.log('✅ Sesión 1: Login exitoso');
      console.log(`   Token 1: ${session1Token?.substring(0, 20)}...`);
    } else {
      console.log('❌ Sesión 1: Login fallido', session1Response.statusCode);
      return;
    }

    // Segunda sesión (simulando segundo navegador)
    const session2Response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (session2Response.statusCode === 200) {
      const session2Data = JSON.parse(session2Response.body);
      session2Token = session2Data.data?.token;
      console.log('✅ Sesión 2: Login exitoso (múltiples sesiones permitidas)');
      console.log(`   Token 2: ${session2Token?.substring(0, 20)}...`);
      
      // Verificar si los tokens son diferentes
      if (session1Token !== session2Token) {
        console.log('✅ Tokens diferentes (sesiones independientes)');
      } else {
        console.log('⚠️ Tokens idénticos (misma sesión reutilizada)');
      }
    } else {
      console.log('❌ Sesión 2: Login fallido', session2Response.statusCode);
      console.log('   Posible bloqueo de sesiones múltiples');
    }

  } catch (error) {
    console.log('❌ Error en prueba de sesiones múltiples:', error.message);
  }

  // 2. Verificar comportamiento de cookies y sesiones
  console.log('\n🍪 PRUEBA 2: Comportamiento de cookies');
  
  try {
    // Verificar headers de respuesta del login
    const loginResponse = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    console.log('📋 Headers de respuesta:');
    Object.keys(loginResponse.headers).forEach(key => {
      if (key.toLowerCase().includes('set-cookie') || key.toLowerCase().includes('cookie')) {
        console.log(`   ${key}: ${loginResponse.headers[key]}`);
      }
    });

    // Verificar si hay cookies de sesión
    const setCookieHeader = loginResponse.headers['set-cookie'];
    if (setCookieHeader) {
      console.log('✅ Cookies de sesión encontradas');
      console.log(`   ${setCookieHeader}`);
      
      if (setCookieHeader.includes('HttpOnly')) {
        console.log('✅ Cookies HttpOnly (más seguras)');
      }
      
      if (setCookieHeader.includes('SameSite')) {
        console.log('✅ Política SameSite configurada');
      }
    } else {
      console.log('❌ No se encontraron cookies de sesión');
      console.log('   El sistema podría usar solo tokens JWT');
    }

  } catch (error) {
    console.log('❌ Error verificando cookies:', error.message);
  }

  // 3. Verificar si una sesión invalida a la otra
  console.log('\n🔄 PRUEBA 3: Invalidación de sesiones');
  
  if (session1Token && session2Token) {
    try {
      // Probar API con sesión 1
      const api1Response = await makeRequest('/api/v1/shipments', 'GET', null, {
        'Authorization': `Bearer ${session1Token}`
      });
      
      console.log(`Sesión 1 API: ${api1Response.statusCode === 200 ? '✅ Activa' : '❌ Invalidada'}`);
      
      // Probar API con sesión 2
      const api2Response = await makeRequest('/api/v1/shipments', 'GET', null, {
        'Authorization': `Bearer ${session2Token}`
      });
      
      console.log(`Sesión 2 API: ${api2Response.statusCode === 200 ? '✅ Activa' : '❌ Invalidada'}`);
      
      if (api1Response.statusCode === 200 && api2Response.statusCode === 200) {
        console.log('✅ Ambas sesiones activas simultáneamente');
      } else {
        console.log('⚠️ Solo una sesión activa a la vez');
      }

    } catch (error) {
      console.log('❌ Error verificando sesiones simultáneas:', error.message);
    }
  }

  // 4. Verificar logout y su efecto en otras sesiones
  console.log('\n🚪 PRUEBA 4: Efecto de logout en otras sesiones');
  
  if (session1Token) {
    try {
      // Hacer logout con sesión 1
      const logoutResponse = await makeRequest('/api/v1/auth/logout', 'POST', null, {
        'Authorization': `Bearer ${session1Token}`
      });
      
      console.log(`Logout Sesión 1: ${logoutResponse.statusCode === 200 ? '✅ Exitoso' : '❌ Fallido'}`);
      
      // Verificar si sesión 2 sigue activa
      if (session2Token) {
        const api2AfterLogout = await makeRequest('/api/v1/shipments', 'GET', null, {
          'Authorization': `Bearer ${session2Token}`
        });
        
        console.log(`Sesión 2 después de logout 1: ${api2AfterLogout.statusCode === 200 ? '✅ Sigue activa' : '❌ Invalidada'}`);
      }

    } catch (error) {
      console.log('❌ Error en prueba de logout:', error.message);
    }
  }

  // 5. Análisis del problema del usuario
  console.log('\n🎯 ANÁLISIS DEL PROBLEMA DEL USUARIO:');
  console.log('📝 Escenario: Usuario con admin en una pestaña, intenta login en otra');
  
  console.log('\n🔍 POSIBLES CAUSAS:');
  console.log('1. Rate limiting por múltiples intentos rápidos');
  console.log('2. Conflicto de cookies entre pestañas');
  console.log('3. Invalidación de sesión anterior al crear nueva');
  console.log('4. Problema de proxy en el frontend (puerto 5173 vs 5174)');
  console.log('5. Cache del navegador interferiendo');
  
  console.log('\n💡 SOLUCIONES RECOMENDADAS:');
  console.log('✅ Usar ventana de incógnito para la segunda sesión');
  console.log('✅ Limpiar cookies y cache del navegador');
  console.log('✅ Esperar 30 segundos entre intentos (rate limiting)');
  console.log('✅ Cerrar la pestaña del admin antes de intentar login nuevo');
  console.log('✅ Verificar configuración de puerto en vite.config.ts');
  
  console.log('\n🌐 INSTRUCCIONES INMEDIATAS:');
  console.log('1. Cierra la pestaña donde tienes el admin logueado');
  console.log('2. Espera 30 segundos');
  console.log('3. Abre http://localhost:5174/ en nueva pestaña');
  console.log('4. Intenta login: admin@demo.com / Admin123!');
  console.log('5. Si funciona, el problema era conflicto de sesiones');
  
  console.log('\n🔧 ALTERNATIVA - ACCESO SIMULTÁNEO:');
  console.log('1. Usa navegadores diferentes (Chrome + Firefox)');
  console.log('2. Usa ventana de incógnito para una de las sesiones');
  console.log('3. Usa perfiles diferentes de navegador');
}

checkSimultaneousSessions();
