web: bundle exec puma -C config/puma.rb
resque: env QUEUES=priority,default,slow INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work
resque_priority: env QUEUES=priority,default INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work
resque_slow: env QUEUES=priority,slow,default,whenever INTERVAL=0.2 TERM_CHILD=1 bundle exec rake environment resque:work
ember: sh -c 'if [ -s "$HOME/.nvm/nvm.sh" ]; then source "$HOME/.nvm/nvm.sh"; elif [ -s "/usr/local/share/nvm/nvm.sh" ]; then source "/usr/local/share/nvm/nvm.sh"; fi && nvm install 18 && nvm use 18 && cd ./app/frontend/ && npx ember server --port 8184 --proxy http://127.0.0.1:5000'