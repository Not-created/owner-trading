from server import app
paths = sorted({route.path for route in app.routes if hasattr(route, 'path')})
for p in paths:
    if '/auth/' in p or '/ai/' in p or '/brokers/' in p or '/plugins' in p or '/settings' in p or '/users' in p or '/logs' in p:
        print(p)
