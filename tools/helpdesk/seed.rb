# 首次部署后跑一次：建管理员账号 + 网站收件箱。
#
#   docker compose exec -T rails bundle exec rails runner /dev/stdin < seed.rb
#
# 为什么不用 Chatwoot 自带的注册页：它的 SignUpEmailValidationService 会做
# 域名的 MX 记录查询，指向内网或本地域名的邮箱会被判「invalid email」。
# 这里直接建 User / AccountUser / Channel::WebWidget，绕开那道校验。
#
# 跑完把 WEBSITE_TOKEN 填进应用的 VITE_CHATWOOT_WEBSITE_TOKEN。

email = ENV.fetch('SEED_EMAIL')
password = ENV.fetch('SEED_PASSWORD')
website_url = ENV.fetch('SEED_WEBSITE_URL', 'http://localhost:5173')

account = Account.first || Account.create!(name: 'Mini Game Factory')

user = User.find_by(email: email)
if user.nil?
  user = User.new(name: 'Joker', email: email, password: password)
  user.skip_confirmation!
  user.save!
  AccountUser.create!(account: account, user: user, role: :administrator)
  puts "USER_CREATED id=#{user.id}"
else
  puts "USER_EXISTS id=#{user.id}"
end

inbox = account.inboxes.find_by(name: '游戏内反馈')
if inbox.nil?
  channel = Channel::WebWidget.new(account: account, website_url: website_url)
  channel.save!
  inbox = account.inboxes.create!(name: '游戏内反馈', channel: channel)
  puts "INBOX_CREATED id=#{inbox.id}"
else
  puts "INBOX_EXISTS id=#{inbox.id}"
end

puts "WEBSITE_TOKEN=#{inbox.channel.website_token}"
