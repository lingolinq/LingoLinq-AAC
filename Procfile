web: bundle exec puma -C config/puma.rb
resque: env QUEUES=priority,default,slow INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work
resque_priority: env QUEUES=priority,default INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work
resque_slow: env QUEUES=priority,slow,default,whenever INTERVAL=0.2 TERM_CHILD=1 bundle exec rake environment resque:work
ember: sh -c 'export NVM_DIR="/usr/local/share/nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 10 && cd ./app/frontend/ && npx ember server --port 8184 --proxy http://localhost:5000'