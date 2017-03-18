# oxo

[![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE.md)

## For developers
### Setup an environment
#### 1. Docker build
```
$ docker-compose build
```

#### 2. npm install
```
$ docker-compose run --rm app /bin/bash
app@XXXXXXXXX: ~/bot$ npm install
app@XXXXXXXXX: ~/bot$ exit
```

#### 3. Start app
```
$ docker-compose up
```

### Tips
#### To access MongoDB from host
The port 27017 is forwarded. Then just access as usual.
```
$ mongo
```

## License
This software is released under the [MIT license](LICENSE.md).
