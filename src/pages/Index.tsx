import Navigation from '@/components/Navigation';
import OriginalDashboard from '@/pages/OriginalDashboard';

const Index = () => {
  console.log('=== INDEX PAGE RENDERING ===');
  
  return (
    <div className="flex min-h-screen bg-background">
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '300px', 
        height: '100vh', 
        backgroundColor: 'red', 
        zIndex: 9999,
        padding: '20px'
      }}>
        <h1 style={{ color: 'white', fontSize: '20px' }}>NAVIGATION DEBUG</h1>
        <div style={{ marginTop: '20px' }}>
          <a href="/bookings" style={{ 
            display: 'block', 
            padding: '10px', 
            backgroundColor: 'yellow', 
            color: 'black', 
            textDecoration: 'none',
            margin: '5px 0'
          }}>
            DIRECT LINK TO BOOKINGS
          </a>
        </div>
        <Navigation />
      </div>
      
      <div className="flex-1 lg:ml-64" style={{ marginLeft: '300px' }}>
        <OriginalDashboard />
      </div>
    </div>
  );
};

export default Index;
