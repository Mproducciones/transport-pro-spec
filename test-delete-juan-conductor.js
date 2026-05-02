// Script para probar eliminación de Juan Conductor
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

async function testDeleteJuanConductor() {
  console.log('🔍 BUSCANDO A JUAN CONDUCTOR...\n');

  // 1. Login como admin
  let adminToken = null;
  try {
    const response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      adminToken = data.data?.token;
      console.log('✅ Login admin exitoso');
    } else {
      console.log('❌ Error login admin:', response.statusCode);
      return;
    }
  } catch (error) {
    console.log('❌ Error login admin:', error.message);
    return;
  }

  // 2. Buscar conductores
  console.log('\n🔍 BUSCANDO LISTA DE CONDUCTORES...');
  
  try {
    const driversResponse = await makeRequest('/api/v1/drivers', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (driversResponse.statusCode === 200) {
      const driversData = JSON.parse(driversResponse.body);
      const drivers = driversData.data || [];
      console.log(`   Conductores encontrados: ${drivers.length}`);
      
      // Buscar Juan Conductor
      const juanConductor = drivers.find(d => 
        d.fullName?.toLowerCase().includes('juan') || 
        d.email?.toLowerCase().includes('juan')
      );
      
      if (juanConductor) {
        console.log(`✅ Juan Conductor encontrado:`);
        console.log(`   ID: ${juanConductor.id}`);
        console.log(`   Nombre: ${juanConductor.fullName}`);
        console.log(`   Email: ${juanConductor.email || 'Sin email'}`);
        
        // 3. Intentar eliminar Juan Conductor
        console.log('\n🗑️ INTENTANDO ELIMINAR A JUAN CONDUCTOR...');
        
        try {
          const deleteResponse = await makeRequest(`/api/v1/drivers/${juanConductor.id}`, 'DELETE', null, {
            'Authorization': `Bearer ${adminToken}`
          });
          
          console.log(`   Status Code: ${deleteResponse.statusCode}`);
          console.log(`   Response: ${deleteResponse.body}`);
          
          if (deleteResponse.statusCode === 200 || deleteResponse.statusCode === 204) {
            console.log('✅ Juan Conductor eliminado exitosamente');
          } else {
            console.log('❌ Error eliminando Juan Conductor');
            const errorData = JSON.parse(deleteResponse.body);
            console.log(`   Error: ${errorData.message || 'Error desconocido'}`);
          }
        } catch (error) {
          console.log('❌ Error en la petición de eliminación:', error.message);
        }
        
      } else {
        console.log('❌ Juan Conductor no encontrado en la lista');
        console.log('\n📋 Lista de conductores:');
        drivers.forEach((d, index) => {
          console.log(`   ${index + 1}. ${d.fullName} (${d.email || 'Sin email'}) - ID: ${d.id}`);
        });
      }
    } else {
      console.log('❌ Error obteniendo conductores:', driversResponse.statusCode);
      console.log('   Response:', driversResponse.body);
    }
  } catch (error) {
    console.log('❌ Error buscando conductores:', error.message);
  }

  // 4. Verificar estado final
  console.log('\n🔍 VERIFICANDO ESTADO FINAL...');
  
  try {
    const finalDriversResponse = await makeRequest('/api/v1/drivers', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (finalDriversResponse.statusCode === 200) {
      const finalData = JSON.parse(finalDriversResponse.body);
      const finalDrivers = finalData.data || [];
      console.log(`   Conductores restantes: ${finalDrivers.length}`);
      
      const juanExists = finalDrivers.some(d => 
        d.fullName?.toLowerCase().includes('juan') || 
        d.email?.toLowerCase().includes('juan')
      );
      
      if (juanExists) {
        console.log('❌ Juan Conductor todavía existe');
      } else {
        console.log('✅ Juan Conductor ha sido eliminado');
      }
    }
  } catch (error) {
    console.log('❌ Error verificando estado final:', error.message);
  }
}

testDeleteJuanConductor();
